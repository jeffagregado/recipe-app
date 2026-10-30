'use server'

import { authUserResponseSchema, forgotPasswordSchema, loginSchema, resendVerificationSchema, resetPasswordSchema, signupResponseSchema, signupSchema } from '@recipe-app/contracts/schemas'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ZodError } from 'zod'
import { withNotice } from '@/lib/notice'
import { authFetch } from './api'
import { mapAuthError, publicFailure, RESET_LINK_INVALID, serviceFailure, type AuthFailure, type AuthMutation, type ForgotPasswordResult, type LogoutResult, type ResendVerificationResult } from './action-result'
import { rememberPendingVerification } from './pending-verification'
import { applySessionCookies, clearSessionCookies, sessionCookieHeader } from './session-cookie'

function validationFailure(error: ZodError): AuthFailure {
	const fieldErrors: Record<string, string[]> = {}
	for (const issue of error.issues) {
		const field = issue.path[0]
		if (typeof field === 'string' && ['displayName', 'email', 'password'].includes(field)) (fieldErrors[field] ??= []).push(issue.message)
	}
	return { ok: false, code: 'VALIDATION_FAILED', message: 'Check your details and try again.', fieldErrors }
}

const EXPECTED_STATUS: Record<AuthMutation, number> = { signup: 201, login: 200, logout: 204, 'resend-verification': 204, 'forgot-password': 204, 'reset-password': 204 }
const ORIGIN_REJECTED: AuthFailure = { ok: false, code: 'ORIGIN_REJECTED', message: 'This request could not be verified. Refresh the page and try again.' }

/** Only the request Origin, client IP and (logout) session cookie reach the API. */
function upstreamHeaders(origin: string, cookie: string) {
	const outgoing = new Headers({ 'Content-Type': 'application/json', Origin: origin })
	if (cookie) outgoing.set('Cookie', cookie)
	return outgoing
}

/** The one server record of why a mutation failed: operation, code and upstream status only. */
function logFailure(operation: AuthMutation, cause: AuthFailure, status?: number): AuthFailure {
	console.warn(`Auth: ${operation} failed with ${cause.code}${status === undefined ? '' : ` (upstream ${status})`}.`)
	return publicFailure(operation, cause)
}

async function applySuccess(operation: AuthMutation, response: Response, store: Awaited<ReturnType<typeof cookies>>): Promise<AuthFailure | undefined> {
	if (operation === 'logout') {
		applySessionCookies(response.headers, store)
		clearSessionCookies(store)
		return
	}
	if (operation === 'resend-verification' || operation === 'forgot-password' || operation === 'reset-password') return
	// Signup creates no session: whatever cookie the response carries is ignored.
	if (operation === 'signup') return signupResponseSchema.safeParse(await response.json().catch(() => undefined)).success ? undefined : logFailure(operation, serviceFailure(operation), response.status)
	const parsed = authUserResponseSchema.safeParse(await response.json().catch(() => undefined))
	if (!parsed.success || applySessionCookies(response.headers, store) === 0) return logFailure(operation, serviceFailure(operation), response.status)
}

async function mutate(operation: AuthMutation, body: unknown): Promise<AuthFailure | undefined> {
	const incoming = await headers()
	const origin = incoming.get('origin')
	if (!origin || origin === 'null') return logFailure(operation, ORIGIN_REJECTED)
	const store = await cookies()
	const cookie = operation === 'logout' ? sessionCookieHeader(store) : ''
	if (operation === 'logout' && !cookie) { clearSessionCookies(store); return }
	try {
		const response = await authFetch(`/auth/${operation}`, incoming, { method: 'POST', headers: upstreamHeaders(origin, cookie), body: JSON.stringify(body) })
		if (response.status !== EXPECTED_STATUS[operation]) return logFailure(operation, mapAuthError(response.status, await response.json().catch(() => undefined), operation), response.status)
		return await applySuccess(operation, response, store)
	} catch {
		// Never replay a mutation with an unknown outcome or leak upstream bodies.
		return logFailure(operation, serviceFailure(operation))
	}
}

export async function signup(input: unknown): Promise<AuthFailure> {
	const parsed = signupSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const error = await mutate('signup', parsed.data)
	if (error) return error
	rememberPendingVerification(await cookies(), parsed.data.email, (await headers()).get('origin'))
	redirect('/check-email')
}

export async function login(input: unknown): Promise<AuthFailure> {
	const parsed = loginSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const error = await mutate('login', parsed.data)
	if (error) return error
	redirect('/recipes')
}

/** The answer is the same whether or not the address has an Account. */
export async function resendVerification(input: unknown): Promise<ResendVerificationResult> {
	const parsed = resendVerificationSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const error = await mutate('resend-verification', parsed.data)
	return error ?? { ok: true }
}

export async function logout(): Promise<LogoutResult> {
	const error = await mutate('logout', {})
	return error ?? { ok: true }
}

/** The answer is the same whether or not the address has an Account. */
export async function forgotPassword(input: unknown): Promise<ForgotPasswordResult> {
	const parsed = forgotPasswordSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const error = await mutate('forgot-password', parsed.data)
	return error ?? { ok: true }
}

/**
 * Sends the token from the emailed link with the new password. Every session of the Account ends, this browser's
 * included, and none is created: the person lands on the login page.
 */
export async function resetPassword(input: unknown): Promise<AuthFailure> {
	const parsed = resetPasswordSchema.safeParse(input)
	if (!parsed.success) {
		// The password is the only field a person typed. Anything else wrong means the link itself is unusable.
		const failure = validationFailure(parsed.error)
		return failure.fieldErrors?.password ? failure : RESET_LINK_INVALID
	}
	const error = await mutate('reset-password', parsed.data)
	if (error) return error
	clearSessionCookies(await cookies())
	redirect(withNotice('/auth/login', 'password-reset'))
}
