import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>(), set: vi.fn() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined, set: next.set }),
}))
const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { connectGoogle } from './connect-google'

const PROVIDER_URL = 'https://accounts.google.com/o/oauth2/v2/auth?state=test-state&client_id=test-client'
const STATE_COOKIE = 'better-auth.state=test-state.test-signature; Max-Age=300; Path=/; HttpOnly; SameSite=Lax'
const FAILED = { status: 'failed', message: 'Couldn’t reach Google. Try again.' }
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	next.set.mockReset()
	fetchMock.mockReset()
	cache.refresh.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

function json(body: unknown, status: number, ...cookies: string[]) {
	const headers = new Headers({ 'Content-Type': 'application/json' })
	for (const cookie of cookies) headers.append('Set-Cookie', cookie)
	return new Response(JSON.stringify(body), { status, headers })
}

it('asks with the session cookie, origin and client address, copies only the state cookie onto the web origin and redirects to Google', async () => {
	fetchMock.mockResolvedValue(json({ url: PROVIDER_URL }, 200, STATE_COOKIE, 'better-auth.session_token=other; Max-Age=604800; Path=/'))
	await expect(connectGoogle()).rejects.toThrow(`NEXT_REDIRECT:${PROVIDER_URL}`)
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/account/google/connect')
	expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error', body: '{}' })
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', 'content-type': 'application/json',
	})
	expect(next.set).toHaveBeenCalledExactlyOnceWith('better-auth.state', 'test-state.test-signature', { httpOnly: true, sameSite: 'lax', path: '/', secure: false, maxAge: 300 })
	// Nothing about the Account has changed yet.
	expect(cache.refresh).not.toHaveBeenCalled()
})

it.each([
	['an expired session', () => json({ code: 'UNAUTHENTICATED', message: 'raw upstream text' }, 401), { status: 'session-expired', message: 'Your session has expired. Sign in again in another tab, then come back here and try again.' }],
	['an origin the API rejects', () => json({ code: 'ORIGIN_REJECTED', message: 'raw upstream text' }, 403), { status: 'failed', message: 'This request could not be verified. Refresh the page and try again.' }],
	['rate limiting', () => json({ code: 'RATE_LIMITED', message: 'raw upstream text' }, 429), { status: 'failed', message: 'Too many attempts. Try again in a few minutes.' }],
	['a refused start', () => json({ code: 'GOOGLE_CONNECT_FAILED', message: 'raw upstream text' }, 400), FAILED],
	['an unavailable service', () => json({ code: 'SERVICE_UNAVAILABLE', message: 'raw upstream text' }, 503), FAILED],
	['an unparseable response', () => new Response('<html>raw upstream text</html>', { status: 200, headers: { 'Set-Cookie': STATE_COOKIE } }), FAILED],
	['a failed or timed out request', () => Promise.reject(new TypeError('Test transport failed')), FAILED],
	['a success without a state cookie', () => json({ url: PROVIDER_URL }, 200), FAILED],
	['a success with two state cookies', () => json({ url: PROVIDER_URL }, 200, STATE_COOKIE, STATE_COOKIE), FAILED],
	['a provider URL that is not http(s)', () => json({ url: 'javascript:alert(1)' }, 200, STATE_COOKIE), FAILED],
])('answers after %s with one message, no cookie, no redirect and no refresh', async (_cause, respond, expected) => {
	fetchMock.mockImplementation(async () => respond())
	expect(await connectGoogle()).toEqual(expected)
	expect(next.set).not.toHaveBeenCalled()
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('refreshes the page when Google turns out to be connected already, so the card shows it', async () => {
	fetchMock.mockResolvedValue(json({ code: 'GOOGLE_ALREADY_LINKED', message: 'raw upstream text' }, 409))
	expect(await connectGoogle()).toEqual({ status: 'failed', message: 'Google is already connected.' })
	expect(cache.refresh).toHaveBeenCalledOnce()
	expect(next.set).not.toHaveBeenCalled()
})

it('does not contact the API without a session cookie or a trusted origin', async () => {
	next.cookies = new Map()
	expect(await connectGoogle()).toEqual({ status: 'session-expired', message: 'Your session has expired. Sign in again in another tab, then come back here and try again.' })
	next.cookies = new Map([['better-auth.session_token', 'abc']])
	next.headers = new Headers()
	expect(await connectGoogle()).toEqual({ status: 'failed', message: 'This request could not be verified. Refresh the page and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
})
