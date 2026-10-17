import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>(), set: vi.fn() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined, set: next.set }),
}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { resetDemo, startDemo } from './actions'

const started = { user: { id: 'demo-user-2', displayName: 'Demo visitor', email: 'a1b2@demo.invalid', pendingEmail: null, hasPassword: false, google: null }, expiresAt: '2026-10-18T09:00:00.000Z' }
const sessionCookie = 'better-auth.session_token=new-demo; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax'
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

it('starts a Demo account with only the origin and client address, sets its session cookie and redirects to /recipes', async () => {
	fetchMock.mockResolvedValue(json(started, 201, sessionCookie))
	await expect(startDemo()).rejects.toThrow('NEXT_REDIRECT:/recipes')
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/demo/start')
	expect(init?.method).toBe('POST')
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9' })
	expect(next.set).toHaveBeenCalledExactlyOnceWith('better-auth.session_token', 'new-demo', { httpOnly: true, sameSite: 'lax', path: '/', secure: false, maxAge: 86400 })
	expect(warn).not.toHaveBeenCalled()
})

it('refuses a request without an Origin locally, without starting a Demo account', async () => {
	next.headers = new Headers()
	expect(await startDemo()).toEqual({ ok: false, code: 'ORIGIN_REJECTED', message: 'This request could not be verified. Refresh the page and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
	expect(warn).toHaveBeenCalledExactlyOnceWith('Demo: start failed with ORIGIN_REJECTED.')
})

const BUSY = { ok: false, code: 'DEMO_BUSY', message: 'The demo is busy right now. Please try again in a few minutes.' }
const RATE_LIMITED = { ok: false, code: 'RATE_LIMITED', message: 'You have started too many demos. Please try again in an hour.' }
const UNAVAILABLE = { ok: false, code: 'SERVICE_UNAVAILABLE', message: 'The demo could not start. Please try again.' }

it.each([
	['the demo is busy', () => json({ code: 'DEMO_BUSY', message: 'raw upstream text' }, 503), BUSY, 'Demo: start failed with DEMO_BUSY (upstream 503).'],
	['too many starts from this address', () => json({ code: 'RATE_LIMITED', message: 'raw upstream text' }, 429), RATE_LIMITED, 'Demo: start failed with RATE_LIMITED (upstream 429).'],
	['an origin the API rejects', () => json({ code: 'ORIGIN_REJECTED', message: 'raw upstream text' }, 403), { ok: false, code: 'ORIGIN_REJECTED', message: 'This request could not be verified. Refresh the page and try again.' }, 'Demo: start failed with ORIGIN_REJECTED (upstream 403).'],
	['an unavailable service', () => json({ code: 'SERVICE_UNAVAILABLE', message: 'raw upstream text' }, 503), UNAVAILABLE, 'Demo: start failed with SERVICE_UNAVAILABLE (upstream 503).'],
	['an unparseable response', () => new Response('<html>raw upstream text</html>', { status: 502 }), UNAVAILABLE, 'Demo: start failed with SERVICE_UNAVAILABLE (upstream 502).'],
	['a failed or timed out request', () => Promise.reject(new TypeError('raw upstream text')), UNAVAILABLE, 'Demo: start failed with SERVICE_UNAVAILABLE.'],
	['a success without a session cookie', () => json(started, 201), UNAVAILABLE, 'Demo: start failed with SERVICE_UNAVAILABLE (upstream 201).'],
	['a success with an unexpected body', () => json({ token: 'raw upstream text' }, 201, sessionCookie), UNAVAILABLE, 'Demo: start failed with SERVICE_UNAVAILABLE (upstream 201).'],
])('answers a start after %s with its message, sets no cookie and logs the cause once', async (_cause, respond, expected, line) => {
	fetchMock.mockImplementation(async () => respond())
	expect(await startDemo()).toEqual(expected)
	expect(next.set).not.toHaveBeenCalled()
	expect(warn).toHaveBeenCalledExactlyOnceWith(line)
	expect(fetchMock).toHaveBeenCalledOnce()
})

it('resets by starting a fresh Demo account, ending the current session and switching to the new cookie', async () => {
	next.cookies.set('better-auth.session_token', 'old-demo')
	fetchMock.mockResolvedValueOnce(json(started, 201, sessionCookie)).mockResolvedValueOnce(new Response(null, { status: 204 }))
	expect(await resetDemo()).toEqual({ ok: true })
	expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['http://api.example/demo/start', 'http://api.example/auth/logout'])
	expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('cookie')).toBeNull()
	expect(new Headers(fetchMock.mock.calls[1][1]?.headers).get('cookie')).toBe('better-auth.session_token=old-demo')
	expect(next.set.mock.calls.at(-1)).toEqual(['better-auth.session_token', 'new-demo', { httpOnly: true, sameSite: 'lax', path: '/', secure: false, maxAge: 86400 }])
})

it('keeps the current Demo account when a fresh one cannot start', async () => {
	next.cookies.set('better-auth.session_token', 'old-demo')
	fetchMock.mockResolvedValue(json({ code: 'DEMO_BUSY', message: 'raw upstream text' }, 503))
	expect(await resetDemo()).toEqual(BUSY)
	expect(fetchMock).toHaveBeenCalledOnce()
	expect(next.set).not.toHaveBeenCalled()
})
