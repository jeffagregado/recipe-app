'use server'

import { googleStartResponseSchema } from '@recipe-app/contracts/schemas'
import { refresh } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { applyGoogleStateCookies, countGoogleStateCookies } from '@/features/auth/session-cookie'
import { readErrorEnvelope } from '@/features/recipes/api/write-request'
import { SIGN_IN_METHODS_MESSAGES, type ConnectGoogleResult } from './results'
import { postSignInMethod } from './sign-in-method-write'

const failed = (message: string = SIGN_IN_METHODS_MESSAGES.connectFailed): ConnectGoogleResult => ({ status: 'failed', message })

/**
 * Asks the API for a provider URL that attaches Google to the signed-in Account, and sends the browser to Google. The
 * API binds the flow to this session and signs a state cookie for it; the cookie is copied onto the web origin here so
 * the callback route can hand it back. Nothing about the Account changes until Google returns.
 */
export async function connectGoogle(): Promise<ConnectGoogleResult> {
	// Starting again is harmless, so an unknown outcome is simply a failure the person can retry.
	const sent = await postSignInMethod('/account/google/connect', SIGN_IN_METHODS_MESSAGES.connectFailed)
	if ('refusal' in sent) return sent.refusal
	const { response } = sent
	if (response.status === 409 && (await readErrorEnvelope(response))?.code === 'GOOGLE_ALREADY_LINKED') {
		// The page is out of date: Google was connected since it rendered. The refreshed card shows it.
		refresh()
		return failed(SIGN_IN_METHODS_MESSAGES.alreadyConnected)
	}
	if (response.status !== 200) return failed()

	let payload: unknown
	try { payload = await response.json() } catch { payload = null }
	const started = googleStartResponseSchema.safeParse(payload)
	// Exactly one state cookie belongs to one flow; anything else is not an answer to follow.
	if (!started.success || countGoogleStateCookies(response.headers) !== 1) return failed()
	applyGoogleStateCookies(response.headers, await cookies())
	redirect(started.data.url)
}
