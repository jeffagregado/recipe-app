import { NextRequest } from 'next/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/auth/callback/google/route'

const CODE = 'test-only-code'
const STATE = 'test-only-state'
const STATE_VALUE = 'test-only-state.test/signature'
const SESSION = 'better-auth.session_token=abc; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax'
const CLEARED_STATE = ['better-auth.state=; Path=/; Max-Age=0; HttpOnly; SameSite=lax', '__Secure-better-auth.state=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=lax']
const FAILED = '/auth/login?notice=google-sign-in-failed'
const fetchMock = vi.fn<typeof fetch>()
const warn = vi.spyOn(console, 'warn')

beforeEach(() => {
	fetchMock.mockReset()
	warn.mockReset().mockImplementation(() => {})
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const error = (code: string, status: number) => new Response(JSON.stringify({ code, message: 'raw upstream text' }), { status, headers: { 'Content-Type': 'application/json', 'Set-Cookie': SESSION } })
const signedIn = (...cookies: string[]) => {
	const headers = new Headers()
	for (const cookie of cookies) headers.append('Set-Cookie', cookie)
	return new Response(null, { status: 204, headers })
}
/** The browser arriving from Google: the query Google appended and the cookies the web origin holds. */
const arrive = (query: string, cookie = `better-auth.state=${encodeURIComponent(STATE_VALUE)}; analytics=private; better-auth.session_token=stale`) =>
	GET(new NextRequest(`http://internal-host.invalid:3000/api/auth/callback/google${query}`, { headers: { ...(cookie ? { cookie } : {}), 'x-forwarded-for': '203.0.113.9' } }))
// Next adds an Expires date next to Max-Age; it moves with the clock, so it is left out of the comparison.
const cookiesOf = (response: Response) => response.headers.getSetCookie().map((cookie) => cookie.replace(/ Expires=[^;]+;/, ''))

it('forwards the code, the state and only the state cookie, copies the session cookie and redirects into the app', async () => {
	fetchMock.mockResolvedValue(signedIn(SESSION, 'analytics=ignored; Path=/'))
	const response = await arrive(`?code=${CODE}&state=${STATE}&scope=email%20profile&authuser=0&prompt=consent`)
	expect(response.status).toBe(307)
	expect(response.headers.get('location')).toBe('/recipes')
	expect(response.headers.get('cache-control')).toBe('private, no-store')
	expect(response.headers.get('referrer-policy')).toBe('no-referrer')
	expect(cookiesOf(response)).toEqual(['better-auth.session_token=abc; Path=/; Max-Age=604800; HttpOnly; SameSite=lax', ...CLEARED_STATE])
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/auth/google/callback')
	expect(init?.method).toBe('POST')
	expect(init?.body).toBe(`{"code":"${CODE}","state":"${STATE}"}`)
	// The state cookie and the session cookie travel, and no other: the API attaches a connect only for the session that started it.
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({ 'content-type': 'application/json', cookie: `better-auth.state=${encodeURIComponent(STATE_VALUE)}; better-auth.session_token=stale`, 'x-recipe-client-ip': '203.0.113.9' })
	expect(warn).not.toHaveBeenCalled()
})

it('returns to Settings with a notice after a connect, and leaves the session cookie in the browser as it is', async () => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ connected: true }), { status: 200, headers: { 'Content-Type': 'application/json', 'Set-Cookie': SESSION } }))
	const response = await arrive(`?code=${CODE}&state=${STATE}`)
	expect(response.status).toBe(307)
	expect(response.headers.get('location')).toBe('/settings?notice=google-connected')
	expect(response.headers.get('cache-control')).toBe('private, no-store')
	expect(response.headers.get('referrer-policy')).toBe('no-referrer')
	expect(cookiesOf(response)).toEqual(CLEARED_STATE)
	expect(warn).not.toHaveBeenCalled()
})

it.each([
	['a refused connect', () => error('GOOGLE_CONNECT_FAILED', 400), '/settings?notice=google-connect-failed', 'Auth: google-callback failed with GOOGLE_CONNECT_FAILED (upstream 400).'],
	['an identity another Account holds', () => error('GOOGLE_ALREADY_LINKED', 409), '/settings?notice=google-already-linked', 'Auth: google-callback failed with GOOGLE_ALREADY_LINKED (upstream 409).'],
	['a connect of an unverified Google email', () => error('GOOGLE_CONNECT_EMAIL_NOT_VERIFIED', 403), '/settings?notice=google-connect-email-not-verified', 'Auth: google-callback failed with GOOGLE_CONNECT_EMAIL_NOT_VERIFIED (upstream 403).'],
])('returns to Settings with a notice after %s, sets no session and logs the cause once', async (_cause, respond, location, line) => {
	fetchMock.mockImplementation(async () => respond())
	const response = await arrive(`?code=${CODE}&state=${STATE}`)
	expect(response.status).toBe(307)
	expect(response.headers.get('location')).toBe(location)
	expect(cookiesOf(response)).toEqual(CLEARED_STATE)
	expect(warn).toHaveBeenCalledExactlyOnceWith(line)
})

it.each([
	['a refused sign-in', () => error('GOOGLE_SIGN_IN_FAILED', 400), FAILED, 'Auth: google-callback failed with GOOGLE_SIGN_IN_FAILED (upstream 400).'],
	['an unverified Google email', () => error('GOOGLE_EMAIL_NOT_VERIFIED', 403), '/auth/login?notice=google-email-not-verified', 'Auth: google-callback failed with GOOGLE_EMAIL_NOT_VERIFIED (upstream 403).'],
	['an unverified Account with the same email', () => error('EMAIL_NOT_VERIFIED', 403), '/auth/login?notice=google-account-not-verified', 'Auth: google-callback failed with EMAIL_NOT_VERIFIED (upstream 403).'],
	['rate limiting', () => error('RATE_LIMITED', 429), FAILED, 'Auth: google-callback failed with RATE_LIMITED (upstream 429).'],
	['an unavailable service', () => error('SERVICE_UNAVAILABLE', 503), FAILED, 'Auth: google-callback failed with SERVICE_UNAVAILABLE (upstream 503).'],
	['an unparseable response', () => new Response('<html>raw upstream text</html>', { status: 502 }), FAILED, 'Auth: google-callback failed with SERVICE_UNAVAILABLE (upstream 502).'],
	['a failed or timed out request', () => Promise.reject(new TypeError('Test transport failed')), FAILED, 'Auth: google-callback failed with SERVICE_UNAVAILABLE.'],
	['a success without a session cookie', () => signedIn(), FAILED, 'Auth: google-callback failed with SERVICE_UNAVAILABLE (upstream 204).'],
	['a success with two session cookies', () => signedIn(SESSION, SESSION), FAILED, 'Auth: google-callback failed with SERVICE_UNAVAILABLE (upstream 204).'],
	['a 200 that does not say a connect happened', () => new Response(JSON.stringify({ connected: false }), { status: 200, headers: { 'Set-Cookie': SESSION } }), FAILED, 'Auth: google-callback failed with SERVICE_UNAVAILABLE (upstream 200).'],
	['a code that names an inherited property', () => error('toString', 400), FAILED, 'Auth: google-callback failed with SERVICE_UNAVAILABLE (upstream 400).'],
])('returns to login with a notice after %s, sets no session and logs the cause once without the code', async (_cause, respond, location, line) => {
	fetchMock.mockImplementation(async () => respond())
	const response = await arrive(`?code=${CODE}&state=${STATE}`)
	expect(response.status).toBe(307)
	expect(response.headers.get('location')).toBe(location)
	expect(response.headers.get('cache-control')).toBe('private, no-store')
	expect(cookiesOf(response)).toEqual(CLEARED_STATE)
	expect(warn).toHaveBeenCalledExactlyOnceWith(line)
	for (const secret of [CODE, STATE, 'raw upstream text']) expect(JSON.stringify(warn.mock.calls)).not.toContain(secret)
})

it.each([
	['a cancelled consent', `?error=access_denied&state=${STATE}`, undefined],
	['no query at all', '', undefined],
	['no state cookie on the web origin', `?code=${CODE}&state=${STATE}`, ''],
])('returns to login with a notice after %s without contacting the API or setting a session', async (_case, query, cookie) => {
	const response = await arrive(query, cookie)
	expect(response.status).toBe(307)
	expect(response.headers.get('location')).toBe(FAILED)
	expect(cookiesOf(response)).toEqual(CLEARED_STATE)
	expect(fetchMock).not.toHaveBeenCalled()
	expect(warn).toHaveBeenCalledExactlyOnceWith('Auth: google-callback failed with GOOGLE_SIGN_IN_FAILED.')
})

it('keeps the Secure prefixed cookies of an HTTPS deployment', async () => {
	fetchMock.mockResolvedValue(signedIn('__Secure-better-auth.session_token=abc; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax'))
	const response = await arrive(`?code=${CODE}&state=${STATE}`, '__Secure-better-auth.state=secure-state.signature')
	expect(response.headers.get('location')).toBe('/recipes')
	expect(cookiesOf(response)[0]).toBe('__Secure-better-auth.session_token=abc; Path=/; Max-Age=604800; Secure; HttpOnly; SameSite=lax')
	expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('cookie')).toBe('__Secure-better-auth.state=secure-state.signature')
})
