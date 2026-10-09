'use client'

import { authSessionResponseSchema } from '@recipe-app/contracts/schemas'
import { AUTH_CHANNEL, clearPrivateQueries, leavePrivateSession } from './session-client'

async function isSessionCurrent(userId: string, signal: AbortSignal): Promise<boolean> {
	const response = await fetch('/backend/auth/session', { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) })
	if (response.status === 401) return false
	if (!response.ok) return true
	const result = authSessionResponseSchema.safeParse(await response.json())
	return !result.success || result.data.user.id === userId
}

function handleAuthMessage(data: unknown) {
	if (!data || typeof data !== 'object' || !('type' in data)) return
	if (data.type === 'logout') leavePrivateSession()
	else if (data.type === 'login') { clearPrivateQueries(); window.location.reload() }
}

/** Listen once per shell identity; teardown aborts probes and closes every subscription. */
export function observeSession(userId: string) {
	let active = true
	let checking = false
	const controller = new AbortController()
	async function checkSession() {
		if (checking || document.visibilityState === 'hidden') return
		checking = true
		try {
			const current = await isSessionCurrent(userId, controller.signal)
			if (active && !current) leavePrivateSession()
		} catch {
			// A failed freshness probe must never turn a valid session into logout.
		} finally { checking = false }
	}
	const onFocus = () => { void checkSession() }
	const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void checkSession() }
	const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(AUTH_CHANNEL)
	if (channel) channel.onmessage = (event: MessageEvent<unknown>) => handleAuthMessage(event.data)
	void checkSession()
	window.addEventListener('focus', onFocus)
	document.addEventListener('visibilitychange', onFocus)
	window.addEventListener('pageshow', onPageShow)
	return () => {
		active = false
		controller.abort()
		channel?.close()
		window.removeEventListener('focus', onFocus)
		document.removeEventListener('visibilitychange', onFocus)
		window.removeEventListener('pageshow', onPageShow)
	}
}
