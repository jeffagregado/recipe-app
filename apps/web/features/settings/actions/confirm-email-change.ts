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
	const origin = incoming.get('origin')
	if (!origin || origin === 'null') {
		logFailure('ORIGIN_REJECTED')
		return failed(CONFIRM_EMAIL_MESSAGES.unverified)
	}
	const outgoing = new Headers({ 'Content-Type': 'application/json', Origin: origin })
	const address = incoming.get('x-forwarded-for')
	if (address) outgoing.set('X-Forwarded-For', address)
	const cookie = sessionCookieHeader(await cookies())
	if (cookie) outgoing.set('Cookie', cookie)

	let response: Response
	try {
		response = await authFetch('/account/email-change/confirm', { method: 'POST', headers: outgoing, body: JSON.stringify(parsed.data) })
	} catch {
		logFailure('SERVICE_UNAVAILABLE')
		return failed()
	}
	const payload: unknown = await response.json().catch(() => undefined)
	if (response.status !== 200) {
		const error = authErrorResponseSchema.safeParse(payload)
		const code = error.success ? error.data.code : 'SERVICE_UNAVAILABLE'
		logFailure(code, response.status)
		if (response.status === 400 && (code === 'EMAIL_CHANGE_LINK_INVALID' || code === 'VALIDATION_FAILED')) return { status: 'invalid' }
		if (response.status === 429) return failed(CONFIRM_EMAIL_MESSAGES.rateLimited)
		if (response.status === 403) return failed(CONFIRM_EMAIL_MESSAGES.unverified)
		return failed()
	}
	const confirmed = confirmEmailChangeResponseSchema.safeParse(payload)
	redirect(confirmed.success && confirmed.data.signedIn ? withNotice('/settings', 'email-changed') : withNotice('/', 'email-changed-login'))
}
