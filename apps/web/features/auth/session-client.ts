'use client'

import type { QueryClient } from '@tanstack/react-query'

export const AUTH_CHANNEL = 'my-recipes-auth'
const clients = new Set<QueryClient>()

export function registerPrivateQueries(client: QueryClient) {
	clients.add(client)
	return () => { void client.cancelQueries(); client.clear(); clients.delete(client) }
}

export function clearPrivateQueries() {
	for (const client of clients) { void client.cancelQueries(); client.clear() }
}

export function broadcastAuth(type: 'login' | 'logout') {
	if (typeof BroadcastChannel === 'undefined') return
	const channel = new BroadcastChannel(AUTH_CHANNEL)
	channel.postMessage({ type })
	channel.close()
}

export function leavePrivateSession() {
	document.querySelector('[data-private-content]')?.setAttribute('hidden', '')
	clearPrivateQueries()
	window.location.replace('/auth/login')
}
