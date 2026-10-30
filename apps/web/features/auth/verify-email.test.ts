import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), set: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => next.headers, cookies: async () => ({ set: next.set }) }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { verifyEmail } from './verify-email'

const TOKEN = 'test-only-link-value'
const fetchMock = vi.fn<typeof fetch>()
const warn = vi.spyOn(console, 'warn')

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000' })
	next.set.mockReset()
	fetchMock.mockReset()
	warn.mockReset().mockImplementation(() => {})
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'better-auth.session_token=abc; Max-Age=604800; Path=/' } })
const PENDING_CLEARED = ['pending-verification-email', '', { httpOnly: true, sameSite: 'lax', path: '/', secure: false, maxAge: 0 }]

it.each([
	['a verified link', () => new Response(null, { status: 204, headers: { 'Set-Cookie': 'better-auth.session_token=abc; Max-Age=604800; Path=/' } }), '/auth/login?notice=email-verified'],
	['an expired, used or unknown link', () => json({ code: 'VERIFICATION_LINK_INVALID', message: 'raw upstream text' }, 400), '/verify-email/invalid'],
	['a link the API calls malformed', () => json({ code: 'VALIDATION_FAILED', message: 'raw upstream text' }, 400), '/verify-email/invalid'],
	['rate limiting', () => json({ code: 'RATE_LIMITED', message: 'raw upstream text' }, 429), '/verify-email/unavailable'],
	['an unavailable service', () => json({ code: 'SERVICE_UNAVAILABLE', message: 'raw upstream text' }, 503), '/verify-email/unavailable'],
	['an unparseable response', () => new Response('<html>raw upstream text</html>', { status: 502 }), '/verify-email/unavailable'],
	['a failed or timed out request', () => Promise.reject(new TypeError('Test transport failed')), '/verify-email/unavailable'],
])('redirects after %s without a session cookie or the link value in the log', async (_cause, respond, location) => {
	next.headers.set('x-forwarded-for', '203.0.113.9')
	fetchMock.mockImplementation(async () => respond())
	await expect(verifyEmail({ token: TOKEN })).rejects.toThrow(`NEXT_REDIRECT:${location}`)
	expect(next.set.mock.calls.filter(([name]) => name !== 'pending-verification-email')).toEqual([])
	expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN)
	expect(JSON.stringify(warn.mock.calls)).not.toContain('raw upstream text')
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/auth/verify-email')
	expect(init?.method).toBe('POST')
	expect(init?.body).toBe(`{"token":"${TOKEN}"}`)
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({ 'content-type': 'application/json', 'x-recipe-client-ip': '203.0.113.9' })
})

it('forgets the pending address only once the email is verified', async () => {
	fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
	await expect(verifyEmail({ token: TOKEN })).rejects.toThrow('NEXT_REDIRECT:/auth/login?notice=email-verified')
	expect(next.set.mock.calls).toEqual([PENDING_CLEARED])
	expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('x-recipe-client-ip')).toBe(false)
	next.set.mockReset()
	fetchMock.mockResolvedValueOnce(json({ code: 'VERIFICATION_LINK_INVALID', message: 'raw upstream text' }, 400))
	await expect(verifyEmail({ token: TOKEN })).rejects.toThrow('NEXT_REDIRECT:/verify-email/invalid')
	expect(next.set).not.toHaveBeenCalled()
})

it('marks the cleared cookie secure on an https origin', async () => {
	next.headers = new Headers({ origin: 'https://recipes.example' })
	fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
	await expect(verifyEmail({ token: TOKEN })).rejects.toThrow('NEXT_REDIRECT:/auth/login?notice=email-verified')
	expect(next.set).toHaveBeenCalledExactlyOnceWith('pending-verification-email', '', { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 0 })
})

// The schema's own tests own its limits; this is the link without a token, which the page sends as an empty one.
it('sends a link without a token to the invalid page without contacting the API', async () => {
	await expect(verifyEmail({ token: '' })).rejects.toThrow('NEXT_REDIRECT:/verify-email/invalid')
	expect(next.set).not.toHaveBeenCalled()
	expect(fetchMock).not.toHaveBeenCalled()
})

it.each([
	[400, 'VERIFICATION_LINK_INVALID', 'Auth: verify-email failed with VERIFICATION_LINK_INVALID (upstream 400).'],
	[503, 'SERVICE_UNAVAILABLE', 'Auth: verify-email failed with SERVICE_UNAVAILABLE (upstream 503).'],
])('logs a %i failure once by code and status only', async (status, code, line) => {
	fetchMock.mockResolvedValue(json({ code, message: 'raw upstream text' }, status))
	await expect(verifyEmail({ token: TOKEN })).rejects.toThrow('NEXT_REDIRECT:')
	expect(warn).toHaveBeenCalledExactlyOnceWith(line)
})
