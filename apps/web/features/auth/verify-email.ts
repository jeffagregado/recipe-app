import 'server-only'

import { authErrorResponseSchema, verifyEmailSchema } from '@recipe-app/contracts/schemas'
import { NextResponse } from 'next/server'
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

async function verifyEmail(token: string | null, address: string | null): Promise<VerifyEmailOutcome> {
	const parsed = verifyEmailSchema.safeParse({ token })
	if (!parsed.success) return 'invalid'
	const headers = new Headers({ 'Content-Type': 'application/json' })
	if (address) headers.set('X-Forwarded-For', address)
	let response: Response
	try {
		response = await authFetch('/auth/verify-email', { method: 'POST', headers, body: JSON.stringify(parsed.data) })
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
 * The landing for the link in the verification email. It only verifies and redirects: no session is created and nothing
 * the API sets is passed on. Verifying ends the wait that /check-email shows, so its cookie is cleared.
 */
export async function handleVerifyEmail(request: Request): Promise<Response> {
	const url = new URL(request.url)
	const outcome = await verifyEmail(url.searchParams.get('token'), request.headers.get('x-forwarded-for'))
	// A relative Location: the browser resolves it against the address it asked for. The server's view of its own host
	// can differ (a proxy, or `localhost` for 127.0.0.1), and an absolute redirect there would change origin.
	const response = new NextResponse(null, { status: 307, headers: { Location: DESTINATIONS[outcome], 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
	if (outcome === 'verified') response.cookies.set(PENDING_VERIFICATION_COOKIE, '', pendingVerificationCookie(url.protocol === 'https:', 0))
	return response
}
