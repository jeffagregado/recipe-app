import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)

import { cancelEmailChange, resendEmailChange } from './pending-email-change'

const fetchMock = vi.fn<typeof fetch>()
const user = { id: 'user-1', displayName: 'Ana', email: 'ana@example.com', pendingEmail: null, hasPassword: true }
const SESSION_EXPIRED = 'Your session has expired. Sign in again in another tab, then come back here and try again.'
const UNVERIFIED = 'This request could not be verified. Refresh the page and try again.'

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	cache.refresh.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe.each([
	// Resending leaves the page as it is; cancelling removes the banner, which only a fresh session read shows.
	['resend', resendEmailChange, '/account/email-change/resend', () => new Response(null, { status: 204 }), 'resent', 0, 'Couldn’t send the verification link. Try again.'],
	['cancel', cancelEmailChange, '/account/email-change/cancel', () => new Response(JSON.stringify({ user }), { status: 200 }), 'cancelled', 1, 'Couldn’t cancel the change. Try again.'],
] as const)('%s', (_name, action, path, success, done, refreshes, failure) => {
	it('asks with an empty body and only the session cookie, origin and client address', async () => {
		fetchMock.mockResolvedValue(success())
		expect(await action()).toEqual({ status: done })
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(`http://api.example${path}`)
		expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error', body: '{}' })
		expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
			cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', 'content-type': 'application/json',
		})
		expect(cache.refresh).toHaveBeenCalledTimes(refreshes)
	})

	it.each([
		[401, 'session-expired', SESSION_EXPIRED],
		[403, 'failed', UNVERIFIED],
		[400, 'failed', failure],
		[503, 'failed', failure],
		[201, 'failed', failure],
	])('maps HTTP %s to %s without leaking the response', async (status, expected, message) => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'X', message: 'SELECT secrets' }), { status }))
		expect(await action()).toEqual({ status: expected, message })
		expect(cache.refresh).not.toHaveBeenCalled()
	})

	it('reports a failure for network errors and timeouts instead of throwing', async () => {
		fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
		expect(await action()).toEqual({ status: 'failed', message: failure })
	})

	it('does not contact the API without a session cookie or a trusted origin', async () => {
		next.cookies = new Map()
		expect(await action()).toEqual({ status: 'session-expired', message: SESSION_EXPIRED })
		next.cookies = new Map([['better-auth.session_token', 'abc']])
		next.headers = new Headers()
		expect(await action()).toEqual({ status: 'failed', message: UNVERIFIED })
		expect(fetchMock).not.toHaveBeenCalled()
	})
})

it('tells a person who resent too often to wait', async () => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'RATE_LIMITED', message: 'SELECT secrets' }), { status: 429 }))
	expect(await resendEmailChange()).toEqual({ status: 'failed', message: 'You asked for too many emails. Try again in an hour.' })
})

it('refreshes the page when a resend finds nothing pending, so the stale banner goes away', async () => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'EMAIL_CHANGE_NOT_PENDING', message: 'SELECT secrets' }), { status: 409 }))
	expect(await resendEmailChange()).toEqual({ status: 'failed', message: 'No email change is waiting to be confirmed.' })
	expect(cache.refresh).toHaveBeenCalledOnce()
})
