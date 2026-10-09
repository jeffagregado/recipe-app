import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>(), set: vi.fn() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined, set: next.set }),
}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { login, logout, signup } from './actions'

const credentials = { username: 'test_owner', password: 'x'.repeat(16) }
const user = { user: { id: 'user-1', displayName: 'Test Owner', username: 'test_owner' } }
const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9' })
	next.cookies.clear()
	next.set.mockReset()
	fetchMock.mockReset()
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
	const result = await login({ username: 'a', password: 'short' })
	expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('refuses a missing or null Origin without contacting the API', async () => {
	for (const origin of [undefined, 'null']) {
		next.headers = new Headers(origin ? { origin } : {})
		expect(await login(credentials)).toMatchObject({ ok: false, code: 'ORIGIN_REJECTED' })
	}
	expect(fetchMock).not.toHaveBeenCalled()
})

it('forwards only origin and client address, applies the session cookie and redirects to /recipes', async () => {
	fetchMock.mockResolvedValue(json(user, 200, 'better-auth.session_token=abc; Max-Age=604800; Path=/'))
	await expect(login(credentials)).rejects.toThrow('NEXT_REDIRECT:/recipes')
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/auth/login')
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({ 'content-type': 'application/json', origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9' })
	expect(next.set).toHaveBeenCalledExactlyOnceWith('better-auth.session_token', 'abc', { httpOnly: true, sameSite: 'lax', path: '/', secure: false, maxAge: 604800 })
})

it('maps generic credential and conflict errors to the exact messages', async () => {
	fetchMock.mockResolvedValueOnce(json({ code: 'INVALID_CREDENTIALS', message: 'raw upstream text' }, 401))
	expect(await login(credentials)).toEqual({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' })
	fetchMock.mockResolvedValueOnce(json({ code: 'USERNAME_UNAVAILABLE', message: 'raw upstream text' }, 409))
	expect(await signup({ displayName: 'Owner', ...credentials })).toMatchObject({ ok: false, message: 'Username is unavailable.' })
})

it('treats a success without a session cookie as a failure and never replays signup', async () => {
	fetchMock.mockResolvedValue(json(user, 201))
	expect(await signup({ displayName: 'Owner', ...credentials })).toMatchObject({ ok: false, code: 'SERVICE_UNAVAILABLE' })
	expect(next.set).not.toHaveBeenCalled()
	fetchMock.mockReset()
	fetchMock.mockRejectedValue(new TypeError('Test transport failed'))
	expect(await signup({ displayName: 'Owner', ...credentials })).toMatchObject({ ok: false, message: expect.stringContaining('try logging in with your chosen username') })
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
