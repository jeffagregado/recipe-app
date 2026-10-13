'use server'

import { refresh } from 'next/cache'
import { readErrorEnvelope, readWriteContext, sendWrite } from '@/features/recipes/api/write-request'
import { SET_PASSWORD_MESSAGES, type RequestSetPasswordResult } from './results'

const SEND_TIMEOUT_MS = 20_000

const failed = (message: string = SET_PASSWORD_MESSAGES.failed): RequestSetPasswordResult => ({ status: 'failed', message })

/**
 * Asks the API to mail the signed-in Account a link to create its first password. It takes no input: the API sends the
 * link to the Account's own address. Nothing about the Account changes until the link is used.
 */
export async function requestSetPassword(): Promise<RequestSetPasswordResult> {
	const read = await readWriteContext()
	if ('problem' in read) return read.problem === 'session-expired' ? { status: 'session-expired', message: SET_PASSWORD_MESSAGES.sessionExpired } : failed(SET_PASSWORD_MESSAGES.unverified)

	const outcome = await sendWrite({
		context: read.context,
		request: { method: 'POST', path: '/account/password/set-link', body: '{}', contentType: 'application/json', timeoutMs: SEND_TIMEOUT_MS },
	})
	// Asking again is harmless, so an unknown outcome is simply a failure the person can retry.
	if ('problem' in outcome) return failed()
	const { response } = outcome
	if (response.status === 204) return { status: 'sent' }
	if (response.status === 401) return { status: 'session-expired', message: SET_PASSWORD_MESSAGES.sessionExpired }
	if (response.status === 403) return failed(SET_PASSWORD_MESSAGES.unverified)
	if (response.status === 429) return failed(SET_PASSWORD_MESSAGES.rateLimited)
	if (response.status === 409 && (await readErrorEnvelope(response))?.code === 'PASSWORD_ALREADY_SET') {
		// The page is out of date: a password was set since it rendered. The refreshed card shows the change form.
		refresh()
		return failed(SET_PASSWORD_MESSAGES.alreadySet)
	}
	return failed()
}
