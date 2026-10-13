'use server'

import { refresh } from 'next/cache'
import { readErrorEnvelope, readWriteContext, sendWrite } from '@/features/recipes/api/write-request'
import { EMAIL_MESSAGES, type PendingEmailChangeResult } from './results'

const SEND_TIMEOUT_MS = 20_000

/** Posts an empty body for the signed-in Account's own pending change; every refusal the two banner actions share is answered here. */
async function post(path: string, failure: string): Promise<Response | PendingEmailChangeResult> {
	const read = await readWriteContext()
	if ('problem' in read) return read.problem === 'session-expired' ? { status: 'session-expired', message: EMAIL_MESSAGES.sessionExpired } : { status: 'failed', message: EMAIL_MESSAGES.unverified }
	const outcome = await sendWrite({ context: read.context, request: { method: 'POST', path, body: '{}', contentType: 'application/json', timeoutMs: SEND_TIMEOUT_MS } })
	// Asking again is harmless, so an unknown outcome is simply a failure the person can retry.
	if ('problem' in outcome) return { status: 'failed', message: failure }
	if (outcome.response.status === 401) return { status: 'session-expired', message: EMAIL_MESSAGES.sessionExpired }
	if (outcome.response.status === 403) return { status: 'failed', message: EMAIL_MESSAGES.unverified }
	return outcome.response
}

/** Asks the API to mail a fresh link to the address the Account is already waiting on. It takes no input. */
export async function resendEmailChange(): Promise<PendingEmailChangeResult> {
	const response = await post('/account/email-change/resend', EMAIL_MESSAGES.failed)
	if (!(response instanceof Response)) return response
	if (response.status === 204) return { status: 'resent' }
	if (response.status === 429) return { status: 'failed', message: EMAIL_MESSAGES.resendLimited }
	if (response.status === 409 && (await readErrorEnvelope(response))?.code === 'EMAIL_CHANGE_NOT_PENDING') {
		// The page is out of date: the change was confirmed or cancelled since it rendered. The refreshed card has no banner.
		refresh()
		return { status: 'failed', message: EMAIL_MESSAGES.notPending }
	}
	return { status: 'failed', message: EMAIL_MESSAGES.failed }
}

/** Drops the pending change. The refreshed session read no longer carries the address, so the banner goes away. */
export async function cancelEmailChange(): Promise<PendingEmailChangeResult> {
	const response = await post('/account/email-change/cancel', EMAIL_MESSAGES.cancelFailed)
	if (!(response instanceof Response)) return response
	if (response.status !== 200) return { status: 'failed', message: EMAIL_MESSAGES.cancelFailed }
	refresh()
	return { status: 'cancelled' }
}
