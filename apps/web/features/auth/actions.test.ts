import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>(), set: vi.fn() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined, set: next.set }),
}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { login, logout, signup } from './actions'

const credentials = { email: 'owner@example.invalid', password: 'x'.repeat(16) }
const user = { user: { id: 'user-1', displayName: 'Test Owner' } }
const invalidLogin = { ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
const fetchMock = vi.fn<typeof fetch>()
const warn = vi.spyOn(console, 'warn')

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9' })
	next.cookies.clear()
	next.set.mockReset()
	fetchMock.mockReset()
	warn.mockReset().mockImplementation(() => {})
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

function json(body: unknown, status: number, cookie?: string) {
	const headers = new Headers({ 'Content-Type': 'application/json' })
	if (cookie) headers.append('Set-Cookie', cookie)
	return new Response(JSON.stringify(body), { status, headers })
}

it('rejects invalid input before any upstream call', async () => {
	const result = await login({ email: 'not-an-address', password: 'short' })
	expect(result).toEqual({ ok: false, code: 'VALIDATION_FAILED', message: 'Check your details and try again.', fieldErrors: { email: ['Enter a valid email address.'] } })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('sends the normalised email upstream', async () => {
	fetchMock.mockResolvedValue(json(user, 201, 'better-auth.session_token=abc; Max-Age=604800; Path=/'))
	await expect(signup({ displayName: ' Owner ', email: '  Owner@Example.INVALID ', password: credentials.password })).rejects.toThrow('NEXT_REDIRECT:/recipes')
	expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ displayName: 'Owner', ...credentials })
})

it.each([undefined, 'null'])('refuses the Origin %s without contacting the API', async (origin) => {
	next.headers = new Headers(origin ? { origin } : {})
	expect(await login(credentials)).toEqual(invalidLogin)
	expect(warn).toHaveBeenCalledExactlyOnceWith('Auth: login failed with ORIGIN_REJECTED.')
	expect(await signup({ displayName: 'Owner', ...credentials })).toEqual({ ok: false, code: 'ORIGIN_REJECTED', message: 'This request could not be verified. Refresh the page and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
})

it.each([
	['wrong credentials', () => json({ code: 'INVALID_CREDENTIALS', message: 'raw upstream text' }, 401), 'Auth: login failed with INVALID_CREDENTIALS (upstream 401).'],
	['an unavailable service', () => json({ code: 'SERVICE_UNAVAILABLE', message: 'raw upstream text' }, 503), 'Auth: login failed with SERVICE_UNAVAILABLE (upstream 503).'],
	['a failed or timed out request', () => Promise.reject(new TypeError('Test transport failed')), 'Auth: login failed with SERVICE_UNAVAILABLE.'],
	['an origin the API rejects', () => json({ code: 'ORIGIN_REJECTED', message: 'raw upstream text' }, 403), 'Auth: login failed with ORIGIN_REJECTED (upstream 403).'],
	['rate limiting', () => json({ code: 'RATE_LIMITED', message: 'raw upstream text' }, 429), 'Auth: login failed with RATE_LIMITED (upstream 429).'],
	['a payload that is too large', () => json({ code: 'PAYLOAD_TOO_LARGE', message: 'raw upstream text' }, 413), 'Auth: login failed with PAYLOAD_TOO_LARGE (upstream 413).'],
	['an unparseable response', () => new Response('<html>raw upstream text</html>', { status: 502 }), 'Auth: login failed with SERVICE_UNAVAILABLE (upstream 502).'],
	['an unexpected response', () => json({ token: 'test-only', message: 'raw upstream text' }, 500), 'Auth: login failed with SERVICE_UNAVAILABLE (upstream 500).'],
	['a success without a session cookie', () => json(user, 200), 'Auth: login failed with SERVICE_UNAVAILABLE (upstream 200).'],
])('answers login with the one message after %s and logs the cause once', async (_cause, respond, line) => {
	fetchMock.mockImplementation(async () => respond())
	expect(await login(credentials)).toEqual(invalidLogin)
	expect(warn).toHaveBeenCalledExactlyOnceWith(line)
	expect(next.set).not.toHaveBeenCalled()
})

it('logs signup and logout failures without the credentials, the session cookie or the upstream body', async () => {
	fetchMock.mockResolvedValueOnce(json({ code: 'RATE_LIMITED', message: 'raw upstream text' }, 429))
	expect(await signup({ displayName: 'Owner', ...credentials })).toEqual({ ok: false, code: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' })
	next.cookies.set('better-auth.session_token', 'abc')
	fetchMock.mockResolvedValueOnce(json({ code: 'SERVICE_UNAVAILABLE', message: 'raw upstream text' }, 503))
	await logout()
	expect(warn.mock.calls).toEqual([['Auth: signup failed with RATE_LIMITED (upstream 429).'], ['Auth: logout failed with SERVICE_UNAVAILABLE (upstream 503).']])
	const logged = JSON.stringify(warn.mock.calls)
	for (const secret of [credentials.email, credentials.password, 'Owner', 'abc', 'raw upstream text']) expect(logged).not.toContain(secret)
})

it('forwards only origin and client address, applies the session cookie and redirects to /recipes', async () => {
	fetchMock.mockResolvedValue(json(user, 200, 'better-auth.session_token=abc; Max-Age=604800; Path=/'))
	await expect(login(credentials)).rejects.toThrow('NEXT_REDIRECT:/recipes')
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/auth/login')
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({ 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9' })
	expect(next.set).toHaveBeenCalledExactlyOnceWith('better-auth.session_token', 'abc', { httpOnly: true, sameSite: 'lax', path: '/', secure: false, maxAge: 604800 })
})

it('maps an email conflict to the exact message on the email field', async () => {
	fetchMock.mockResolvedValueOnce(json({ code: 'EMAIL_ALREADY_EXISTS', message: 'raw upstream text' }, 409))
	expect(await signup({ displayName: 'Owner', ...credentials })).toEqual({ ok: false, code: 'EMAIL_ALREADY_EXISTS', message: 'Email already exists.', fieldErrors: { email: ['Email already exists.'] } })
})

it('treats a success without a session cookie as a failure and never replays signup', async () => {
	fetchMock.mockResolvedValue(json(user, 201))
	expect(await signup({ displayName: 'Owner', ...credentials })).toMatchObject({ ok: false, code: 'SERVICE_UNAVAILABLE' })
	expect(next.set).not.toHaveBeenCalled()
	fetchMock.mockReset()
	fetchMock.mockRejectedValue(new TypeError('Test transport failed'))
	expect(await signup({ displayName: 'Owner', ...credentials })).toMatchObject({ ok: false, message: expect.stringContaining('try logging in with your email') })
	expect(fetchMock).toHaveBeenCalledOnce()
})

it('clears cookies locally without a request when already signed out', async () => {
	expect(await logout()).toEqual({ ok: true })
	expect(fetchMock).not.toHaveBeenCalled()
	expect(next.set).toHaveBeenCalledWith('better-auth.session_token', '', expect.objectContaining({ maxAge: 0 }))
})

it('forwards the session cookie on logout, clears it on 204 and reports a failed revocation', async () => {
	next.cookies.set('better-auth.session_token', 'abc')
	fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
	expect(await logout()).toEqual({ ok: true })
	expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('cookie')).toBe('better-auth.session_token=abc')
	expect(next.set).toHaveBeenCalledWith('better-auth.session_token', '', expect.objectContaining({ maxAge: 0 }))
	next.set.mockReset()
	fetchMock.mockResolvedValueOnce(json({ code: 'SERVICE_UNAVAILABLE', message: 'raw upstream text' }, 503))
	expect(await logout()).toMatchObject({ ok: false, code: 'SERVICE_UNAVAILABLE', message: 'Could not confirm logout. Please try again.' })
	expect(next.set).not.toHaveBeenCalled()
})
