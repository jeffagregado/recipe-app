import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)

import { disconnectGoogle } from './disconnect-google'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	cache.refresh.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('asks with an empty body and only the session cookie, origin and client address, then refreshes the page', async () => {
	fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
	expect(await disconnectGoogle()).toEqual({ status: 'disconnected' })
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/account/google/disconnect')
	expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error', body: '{}' })
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-recipe-client-ip': '203.0.113.9', 'content-type': 'application/json',
	})
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it.each([
	[401, 'session-expired', 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
	[403, 'failed', 'This request could not be verified. Refresh the page and try again.'],
	[429, 'failed', 'Too many attempts. Try again in a few minutes.'],
	[400, 'failed', 'Couldn’t disconnect Google. Try again.'],
	[409, 'failed', 'Couldn’t disconnect Google. Try again.'],
	[503, 'failed', 'Couldn’t disconnect Google. Try again.'],
	[200, 'failed', 'Couldn’t disconnect Google. Try again.'],
])('maps HTTP %s to %s without leaking the response or refreshing', async (status, expected, message) => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'X', message: 'SELECT secrets' }), { status }))
	expect(await disconnectGoogle()).toEqual({ status: expected, message })
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('refreshes the page when the Account turns out to have no password, so the card shows why the button is disabled', async () => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'PASSWORD_REQUIRED', message: 'SELECT secrets' }), { status: 409 }))
	expect(await disconnectGoogle()).toEqual({ status: 'failed', message: 'Set a password first.' })
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it('reports a failure for a lost connection and refreshes, since Google may already be gone', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await disconnectGoogle()).toEqual({ status: 'failed', message: 'Couldn’t disconnect Google. Try again.' })
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it('does not contact the API without a session cookie or a trusted origin', async () => {
	next.cookies = new Map()
	expect(await disconnectGoogle()).toEqual({ status: 'session-expired', message: 'Your session has expired. Sign in again in another tab, then come back here and try again.' })
	next.cookies = new Map([['better-auth.session_token', 'abc']])
	next.headers = new Headers()
	expect(await disconnectGoogle()).toEqual({ status: 'failed', message: 'This request could not be verified. Refresh the page and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
	expect(cache.refresh).not.toHaveBeenCalled()
})
