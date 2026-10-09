'use server'

import { authUserResponseSchema, loginSchema, signupSchema } from '@recipe-app/contracts/schemas'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { ZodError } from 'zod'
import { authFetch } from './api'
import { mapAuthError, serviceFailure, type AuthFailure, type AuthMutation, type LogoutResult } from './action-result'
import { applySessionCookies, clearSessionCookies, sessionCookieHeader } from './session-cookie'

function validationFailure(error: ZodError): AuthFailure {
	const fieldErrors: Record<string, string[]> = {}
	for (const issue of error.issues) {
		const field = issue.path[0]
		if (typeof field === 'string' && ['displayName', 'username', 'password'].includes(field)) (fieldErrors[field] ??= []).push(issue.message)
	}
	return { ok: false, code: 'VALIDATION_FAILED', message: 'Check your details and try again.', fieldErrors }
}

const EXPECTED_STATUS: Record<AuthMutation, number> = { signup: 201, login: 200, logout: 204 }
const ORIGIN_REJECTED: AuthFailure = { ok: false, code: 'ORIGIN_REJECTED', message: 'This request could not be verified. Refresh the page and try again.' }

/** Only the request Origin, client address and (logout) session cookie reach the API. */
function upstreamHeaders(origin: string, address: string | null, cookie: string) {
	const outgoing = new Headers({ 'Content-Type': 'application/json', Origin: origin })
	if (address) outgoing.set('X-Forwarded-For', address)
	if (cookie) outgoing.set('Cookie', cookie)
	return outgoing
}

async function applySuccess(operation: AuthMutation, response: Response, store: Awaited<ReturnType<typeof cookies>>): Promise<AuthFailure | undefined> {
	if (operation === 'logout') {
		applySessionCookies(response.headers, store)
		clearSessionCookies(store)
		return
	}
	const parsed = authUserResponseSchema.safeParse(await response.json())
	if (!parsed.success || applySessionCookies(response.headers, store) === 0) return serviceFailure(operation)
}

async function mutate(operation: AuthMutation, body: unknown): Promise<AuthFailure | undefined> {
	const incoming = await headers()
	const origin = incoming.get('origin')
	if (!origin || origin === 'null') return ORIGIN_REJECTED
	const store = await cookies()
	const cookie = operation === 'logout' ? sessionCookieHeader(store) : ''
	if (operation === 'logout' && !cookie) { clearSessionCookies(store); return }
	try {
		const response = await authFetch(`/auth/${operation}`, { method: 'POST', headers: upstreamHeaders(origin, incoming.get('x-forwarded-for'), cookie), body: JSON.stringify(body) })
		if (response.status !== EXPECTED_STATUS[operation]) return mapAuthError(response.status, await response.json(), operation)
		return await applySuccess(operation, response, store)
	} catch {
		// Never replay a mutation with an unknown outcome or leak upstream bodies.
		return serviceFailure(operation)
	}
}

export async function signup(input: unknown): Promise<AuthFailure> {
	const parsed = signupSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const error = await mutate('signup', parsed.data)
	if (error) return error
	redirect('/recipes')
}

export async function login(input: unknown): Promise<AuthFailure> {
	const parsed = loginSchema.safeParse(input)
	if (!parsed.success) return validationFailure(parsed.error)
	const error = await mutate('login', parsed.data)
	if (error) return error
	redirect('/recipes')
}

export async function logout(): Promise<LogoutResult> {
	const error = await mutate('logout', {})
	return error ?? { ok: true }
}
