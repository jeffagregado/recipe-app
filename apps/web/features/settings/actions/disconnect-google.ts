'use server'

import { refresh } from 'next/cache'
import { readErrorEnvelope } from '@/features/recipes/api/write-request'
import { SIGN_IN_METHODS_MESSAGES, type DisconnectGoogleResult } from './results'
import { postSignInMethod } from './sign-in-method-write'

const failed = (message: string = SIGN_IN_METHODS_MESSAGES.disconnectFailed): DisconnectGoogleResult => ({ status: 'failed', message })

/**
 * Removes Google from the signed-in Account's Sign-in methods. It takes no input: the API removes the Account's own
 * Google identity, and only while a password remains. The session read is never cached, so a confirmed removal
 * refreshes the router and the card renders the Connect button.
 */
export async function disconnectGoogle(): Promise<DisconnectGoogleResult> {
	const sent = await postSignInMethod('/account/google/disconnect', SIGN_IN_METHODS_MESSAGES.disconnectFailed)
	if ('refusal' in sent) {
		// The removal may have happened: the refreshed card shows which, and disconnecting again is harmless.
		if (sent.unknown) refresh()
		return sent.refusal
	}
	const { response } = sent
	if (response.status === 204) {
		refresh()
		return { status: 'disconnected' }
	}
	if (response.status === 409 && (await readErrorEnvelope(response))?.code === 'PASSWORD_REQUIRED') {
		// The page is out of date: the Account has no password. The refreshed card disables the button and says why.
		refresh()
		return failed(SIGN_IN_METHODS_MESSAGES.passwordRequired)
	}
	return failed()
}
