'use server'

import { authErrorResponseSchema, confirmEmailChangeResponseSchema, confirmEmailChangeSchema } from '@recipe-app/contracts/schemas'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { authFetch } from '@/features/auth/api'
import { sessionCookieHeader } from '@/features/auth/session-cookie'
import { withNotice } from '@/lib/notice'
import { CONFIRM_EMAIL_MESSAGES, type ConfirmEmailChangeResult } from './results'

/** The one server record of a failed confirmation: code and upstream status only, never the token. */
function logFailure(code: string, status?: number) {
	console.warn(`Auth: confirm-email-change failed with ${code}${status === undefined ? '' : ` (upstream ${status})`}.`)
}

const failed = (message: string = CONFIRM_EMAIL_MESSAGES.failed): ConfirmEmailChangeResult => ({ status: 'failed', message })
/** The refusals that leave the link usable and have something more exact to say than "try again". */
const STATUS_MESSAGES: Partial<Record<number, string>> = { 403: CONFIRM_EMAIL_MESSAGES.unverified, 429: CONFIRM_EMAIL_MESSAGES.rateLimited }

/** Only the request Origin, the client IP and the session cookie, when there is one, reach the API. */
async function upstreamHeaders(incoming: Headers): Promise<Headers | undefined> {
	const origin = incoming.get('origin')
	if (!origin || origin === 'null') return undefined
	const outgoing = new Headers({ 'Content-Type': 'application/json', Origin: origin })
	const cookie = sessionCookieHeader(await cookies())
	if (cookie) outgoing.set('Cookie', cookie)
	return outgoing
}

/** A link the API will never accept is `invalid`; anything else left it unused, so the person can try again. */
function refused(status: number, payload: unknown): ConfirmEmailChangeResult {
	const error = authErrorResponseSchema.safeParse(payload)
	const code = error.success ? error.data.code : 'SERVICE_UNAVAILABLE'
	logFailure(code, status)
	if (status === 400 && (code === 'EMAIL_CHANGE_LINK_INVALID' || code === 'VALIDATION_FAILED')) return { status: 'invalid' }
	return failed(STATUS_MESSAGES[status])
}

/**
 * Sends the token from the emailed link, and only when the page's button is pressed: opening the link calls nothing. The
 * person may be signed out, so a session cookie is forwarded when there is one and never required. A browser signed in
 * to the Account stays signed in and returns to Settings; any other lands on the login page. No cookie is set either way.
 */
export async function confirmEmailChange(input: unknown): Promise<ConfirmEmailChangeResult> {
	const parsed = confirmEmailChangeSchema.safeParse(input)
	// Nothing here was typed by a person: a token that cannot be sent is a link that cannot be used.
	if (!parsed.success) return { status: 'invalid' }
	const incoming = await headers()
	const outgoing = await upstreamHeaders(incoming)
	if (!outgoing) {
		logFailure('ORIGIN_REJECTED')
		return failed(CONFIRM_EMAIL_MESSAGES.unverified)
	}
	let response: Response
	try {
		response = await authFetch('/account/email-change/confirm', incoming, { method: 'POST', headers: outgoing, body: JSON.stringify(parsed.data) })
	} catch {
		logFailure('SERVICE_UNAVAILABLE')
		return failed()
	}
	const payload: unknown = await response.json().catch(() => undefined)
	if (response.status !== 200) return refused(response.status, payload)
	const confirmed = confirmEmailChangeResponseSchema.safeParse(payload)
	redirect(confirmed.success && confirmed.data.signedIn ? withNotice('/settings', 'email-changed') : withNotice('/auth/login', 'email-changed-login'))
}
