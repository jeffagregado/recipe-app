import 'server-only'

import { readWriteContext, sendWrite } from '@/features/recipes/api/write-request'
import { SIGN_IN_METHODS_MESSAGES } from './results'

const TIMEOUT_MS = 20_000

type Refusal = { status: 'session-expired' | 'failed'; message: string }

/**
 * Posts one empty-bodied Sign-in methods write for the signed-in Account and answers the refusals both writes word the
 * same way. `unknown` says the request may have reached the API. Every other response is the caller's to read.
 */
export async function postSignInMethod(path: '/account/google/connect' | '/account/google/disconnect', failed: string): Promise<{ response: Response } | { refusal: Refusal; unknown: boolean }> {
	const refuse = (message: string, status: Refusal['status'] = 'failed', unknown = false) => ({ refusal: { status, message }, unknown })
	const read = await readWriteContext()
	if ('problem' in read) return read.problem === 'session-expired' ? refuse(SIGN_IN_METHODS_MESSAGES.sessionExpired, 'session-expired') : refuse(SIGN_IN_METHODS_MESSAGES.unverified)

	const outcome = await sendWrite({ context: read.context, request: { method: 'POST', path, body: '{}', contentType: 'application/json', timeoutMs: TIMEOUT_MS } })
	if ('problem' in outcome) return refuse(failed, 'failed', outcome.problem === 'unknown')
	const { response } = outcome
	if (response.status === 401) return refuse(SIGN_IN_METHODS_MESSAGES.sessionExpired, 'session-expired')
	if (response.status === 403) return refuse(SIGN_IN_METHODS_MESSAGES.unverified)
	if (response.status === 429) return refuse(SIGN_IN_METHODS_MESSAGES.rateLimited)
	return { response }
}
