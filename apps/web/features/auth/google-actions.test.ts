import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), set: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => next.headers, cookies: async () => ({ set: next.set }) }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { startGoogleSignIn } from './google-actions'

const PROVIDER_URL = 'https://accounts.google.com/o/oauth2/v2/auth?state=test-state&client_id=test-client'
const STATE_COOKIE = 'better-auth.state=test-state.test-signature; Max-Age=300; Path=/; HttpOnly; SameSite=Lax'
const failed = { ok: false, code: 'GOOGLE_SIGN_IN_FAILED', message: 'Google sign-in is unavailable. Please try again.' }
const fetchMock = vi.fn<typeof fetch>()
const warn = vi.spyOn(console, 'warn')

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9' })
	next.set.mockReset()
	fetchMock.mockReset()
	warn.mockReset().mockImplementation(() => {})
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

function json(body: unknown, status: number, ...cookies: string[]) {
	const headers = new Headers({ 'Content-Type': 'application/json' })
	for (const cookie of cookies) headers.append('Set-Cookie', cookie)
	return new Response(JSON.stringify(body), { status, headers })
}

it.each([
	['http://localhost:3000', 'better-auth.state', false],
	['https://recipes.example', '__Secure-better-auth.state', true],
])('asks the API for the provider URL from %s, copies only the state cookie onto the web origin and redirects to Google', async (origin, name, secure) => {
	next.headers = new Headers({ origin, 'x-forwarded-for': '203.0.113.9', cookie: 'better-auth.session_token=browser-session' })
	fetchMock.mockResolvedValue(json({ url: PROVIDER_URL }, 200, `${name}=test-state.test-signature; Max-Age=300; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`, 'better-auth.session_token=abc; Max-Age=604800; Path=/'))
	await expect(startGoogleSignIn()).rejects.toThrow(`NEXT_REDIRECT:${PROVIDER_URL}`)
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/auth/google/start')
	expect(init?.method).toBe('POST')
	expect(init?.body).toBe('{}')
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({ 'content-type': 'application/json', origin, 'x-recipe-client-ip': '203.0.113.9' })
	expect(next.set).toHaveBeenCalledExactlyOnceWith(name, 'test-state.test-signature', { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge: 300 })
})

it.each([undefined, 'null'])('refuses the Origin %s without contacting the API', async (origin) => {
	next.headers = new Headers(origin ? { origin } : {})
	expect(await startGoogleSignIn()).toEqual(failed)
	expect(warn).toHaveBeenCalledExactlyOnceWith('Auth: google-start failed with ORIGIN_REJECTED.')
	expect(fetchMock).not.toHaveBeenCalled()
})

it.each([
	['a refused sign-in', () => json({ code: 'GOOGLE_SIGN_IN_FAILED', message: 'raw upstream text' }, 400), failed, 'Auth: google-start failed with GOOGLE_SIGN_IN_FAILED (upstream 400).'],
	['an unavailable service', () => json({ code: 'SERVICE_UNAVAILABLE', message: 'raw upstream text' }, 503), failed, 'Auth: google-start failed with SERVICE_UNAVAILABLE (upstream 503).'],
	['an origin the API rejects', () => json({ code: 'ORIGIN_REJECTED', message: 'raw upstream text' }, 403), failed, 'Auth: google-start failed with ORIGIN_REJECTED (upstream 403).'],
	['rate limiting', () => json({ code: 'RATE_LIMITED', message: 'raw upstream text' }, 429), { ok: false, code: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' }, 'Auth: google-start failed with RATE_LIMITED (upstream 429).'],
	['an unparseable response', () => new Response('<html>raw upstream text</html>', { status: 502 }), failed, 'Auth: google-start failed with SERVICE_UNAVAILABLE (upstream 502).'],
	['a failed or timed out request', () => Promise.reject(new TypeError('Test transport failed')), failed, 'Auth: google-start failed with SERVICE_UNAVAILABLE.'],
	['a success without a state cookie', () => json({ url: PROVIDER_URL }, 200), failed, 'Auth: google-start failed with SERVICE_UNAVAILABLE (upstream 200).'],
	['a success with two state cookies', () => json({ url: PROVIDER_URL }, 200, STATE_COOKIE, STATE_COOKIE), failed, 'Auth: google-start failed with SERVICE_UNAVAILABLE (upstream 200).'],
	['a provider URL that is not http(s)', () => json({ url: 'javascript:alert(1)' }, 200, STATE_COOKIE), failed, 'Auth: google-start failed with SERVICE_UNAVAILABLE (upstream 200).'],
])('answers after %s with one message, no cookie, no redirect and the cause logged once', async (_cause, respond, expected, line) => {
	fetchMock.mockImplementation(async () => respond())
	expect(await startGoogleSignIn()).toEqual(expected)
	expect(warn).toHaveBeenCalledExactlyOnceWith(line)
	expect(JSON.stringify(warn.mock.calls)).not.toContain('raw upstream text')
	expect(next.set).not.toHaveBeenCalled()
})
