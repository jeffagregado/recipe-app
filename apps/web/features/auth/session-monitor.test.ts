import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const client = vi.hoisted(() => ({ leavePrivateSession: vi.fn(), clearPrivateQueries: vi.fn() }))
vi.mock('./session-client', () => ({ AUTH_CHANNEL: 'test-auth', ...client }))

import { observeSession } from './session-monitor'

const fetchMock = vi.fn<typeof fetch>()
const session = (id: string) => new Response(JSON.stringify({ user: { id, displayName: 'Test Owner', hasPassword: true }, expiresAt: '2030-01-01T00:00:00.000Z' }), { status: 200 })
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
let stop: (() => void) | undefined

beforeEach(() => { vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { stop?.(); stop = undefined; fetchMock.mockReset(); client.leavePrivateSession.mockReset(); client.clearPrivateQueries.mockReset(); vi.unstubAllGlobals() })

it.each([
	['an expired session', () => new Response(null, { status: 401 }), 1],
	['a different user', () => session('user-2'), 1],
	['the same user', () => session('user-1'), 0],
	['a service outage', () => new Response(null, { status: 503 }), 0],
	['invalid session data', () => new Response('{}', { status: 200 }), 0],
])('probes on mount and handles %s', async (_name, response, leaves) => {
	fetchMock.mockResolvedValue(response())
	stop = observeSession('user-1')
	await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
	await settle()
	expect(client.leavePrivateSession).toHaveBeenCalledTimes(leaves)
	expect(fetchMock.mock.calls[0][0]).toBe('/backend/auth/session')
})

it('never turns a failed probe into a logout and re-probes on focus', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('Test transport failed'))
	stop = observeSession('user-1')
	await settle()
	expect(client.leavePrivateSession).not.toHaveBeenCalled()
	fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
	window.dispatchEvent(new Event('focus'))
	await vi.waitFor(() => expect(client.leavePrivateSession).toHaveBeenCalledOnce())
})

it('stops reacting after teardown', async () => {
	fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
	observeSession('user-1')()
	await settle()
	fetchMock.mockClear()
	window.dispatchEvent(new Event('focus'))
	await settle()
	expect(fetchMock).not.toHaveBeenCalled()
	expect(client.leavePrivateSession).not.toHaveBeenCalled()
})

it('leaves on a cross-tab logout message', async () => {
	fetchMock.mockResolvedValue(session('user-1'))
	stop = observeSession('user-1')
	await settle()
	const sender = new BroadcastChannel('test-auth')
	sender.postMessage({ type: 'logout' })
	await vi.waitFor(() => expect(client.leavePrivateSession).toHaveBeenCalledOnce())
	sender.close()
})
