'use server'

import { authErrorResponseSchema, verifyEmailSchema } from '@recipe-app/contracts/schemas'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { withNotice } from '@/lib/notice'
import { authFetch } from './api'
import { PENDING_VERIFICATION_COOKIE, pendingVerificationCookie } from './pending-verification'

type VerifyEmailOutcome = 'verified' | 'invalid' | 'unavailable'

/** A link the API will never accept is `invalid`; a link it could not judge is `unavailable`, because it was not consumed. */
const DESTINATIONS: Record<VerifyEmailOutcome, string> = {
	verified: withNotice('/', 'email-verified'),
	invalid: '/verify-email/invalid',
	unavailable: '/verify-email/unavailable',
}

/** The one server record of a failed verification: code and upstream status only, never the token. */
function logFailure(code: string, status?: number) {
	console.warn(`Auth: verify-email failed with ${code}${status === undefined ? '' : ` (upstream ${status})`}.`)
}

async function sendToken(token: string, address: string | null): Promise<VerifyEmailOutcome> {
	const outgoing = new Headers({ 'Content-Type': 'application/json' })
	if (address) outgoing.set('X-Forwarded-For', address)
	let response: Response
	try {
		response = await authFetch('/auth/verify-email', { method: 'POST', headers: outgoing, body: JSON.stringify({ token }) })
	} catch {
		logFailure('SERVICE_UNAVAILABLE')
		return 'unavailable'
	}
	if (response.status === 204) return 'verified'
	const error = authErrorResponseSchema.safeParse(await response.json().catch(() => undefined))
	const code = error.success ? error.data.code : 'SERVICE_UNAVAILABLE'
	logFailure(code, response.status)
	return response.status === 400 && (code === 'VERIFICATION_LINK_INVALID' || code === 'VALIDATION_FAILED') ? 'invalid' : 'unavailable'
}

/**
 * Sends the token from the emailed link, and only when the page's button is pressed: opening the link calls nothing, so
 * a mail scanner that opens it cannot spend it. It only verifies and redirects: no session is created and nothing the
 * API sets is passed on. Verifying ends the wait that /check-email shows, so its cookie is cleared.
 */
export async function verifyEmail(input: unknown): Promise<never> {
	const parsed = verifyEmailSchema.safeParse(input)
	// Nothing here was typed by a person: a token that cannot be sent is a link that cannot be used.
	if (!parsed.success) redirect(DESTINATIONS.invalid)
	const incoming = await headers()
	const outcome = await sendToken(parsed.data.token, incoming.get('x-forwarded-for'))
	if (outcome === 'verified') (await cookies()).set(PENDING_VERIFICATION_COOKIE, '', pendingVerificationCookie(incoming.get('origin')?.startsWith('https://') ?? false, 0))
	redirect(DESTINATIONS[outcome])
}
