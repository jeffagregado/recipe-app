import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)

import { requestSetPassword } from './request-set-password'

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

it('asks with an empty body and only the session cookie, origin and client address', async () => {
	fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
	expect(await requestSetPassword()).toEqual({ status: 'sent' })
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/account/password/set-link')
	expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error', body: '{}' })
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-recipe-client-ip': '203.0.113.9', 'content-type': 'application/json',
	})
	// Nothing about the Account changes until the link is used.
	expect(cache.refresh).not.toHaveBeenCalled()
})

it.each([
	[401, 'session-expired', 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
	[403, 'failed', 'This request could not be verified. Refresh the page and try again.'],
	[429, 'failed', 'You asked for too many emails. Try again in an hour.'],
	[400, 'failed', 'Couldn’t send the email. Try again.'],
	[503, 'failed', 'Couldn’t send the email. Try again.'],
	[200, 'failed', 'Couldn’t send the email. Try again.'],
])('maps HTTP %s to %s without leaking the response', async (status, expected, message) => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'X', message: 'SELECT secrets' }), { status }))
	expect(await requestSetPassword()).toEqual({ status: expected, message })
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('refreshes the page when the Account turns out to have a password, so the card shows the change form', async () => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'PASSWORD_ALREADY_SET', message: 'SELECT secrets' }), { status: 409 }))
	expect(await requestSetPassword()).toEqual({ status: 'failed', message: 'This Account already has a password.' })
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it('reports a failure for network errors and timeouts instead of throwing', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await requestSetPassword()).toEqual({ status: 'failed', message: 'Couldn’t send the email. Try again.' })
})

it('does not contact the API without a session cookie or a trusted origin', async () => {
	next.cookies = new Map()
	expect(await requestSetPassword()).toMatchObject({ status: 'session-expired' })
	next.cookies = new Map([['better-auth.session_token', 'abc']])
	next.headers = new Headers()
	expect(await requestSetPassword()).toEqual({ status: 'failed', message: 'This request could not be verified. Refresh the page and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
})
