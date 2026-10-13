import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GET } from '@/app/verify-email/route'

const TOKEN = 'test-only-link-value'
const fetchMock = vi.fn<typeof fetch>()
const warn = vi.spyOn(console, 'warn')

beforeEach(() => {
	fetchMock.mockReset()
	warn.mockReset().mockImplementation(() => {})
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'better-auth.session_token=abc; Max-Age=604800; Path=/' } })
const open = (query: string, headers: Record<string, string> = {}) => GET(new Request(`http://localhost:3000/verify-email${query}`, { headers }))

it.each([
	['a verified link', () => new Response(null, { status: 204, headers: { 'Set-Cookie': 'better-auth.session_token=abc; Max-Age=604800; Path=/' } }), 'http://localhost:3000/?notice=email-verified'],
	['an expired, used or unknown link', () => json({ code: 'VERIFICATION_LINK_INVALID', message: 'raw upstream text' }, 400), 'http://localhost:3000/verify-email/invalid'],
	['a link the API calls malformed', () => json({ code: 'VALIDATION_FAILED', message: 'raw upstream text' }, 400), 'http://localhost:3000/verify-email/invalid'],
	['rate limiting', () => json({ code: 'RATE_LIMITED', message: 'raw upstream text' }, 429), 'http://localhost:3000/verify-email/unavailable'],
	['an unavailable service', () => json({ code: 'SERVICE_UNAVAILABLE', message: 'raw upstream text' }, 503), 'http://localhost:3000/verify-email/unavailable'],
	['an unparseable response', () => new Response('<html>raw upstream text</html>', { status: 502 }), 'http://localhost:3000/verify-email/unavailable'],
	['a failed or timed out request', () => Promise.reject(new TypeError('Test transport failed')), 'http://localhost:3000/verify-email/unavailable'],
])('redirects after %s without caching, a session cookie or the link value in the log', async (_cause, respond, location) => {
	fetchMock.mockImplementation(async () => respond())
	const response = await open(`?token=${TOKEN}`, { 'x-forwarded-for': '203.0.113.9' })
	expect(response.status).toBe(307)
	expect(response.headers.get('location')).toBe(location)
	expect(response.headers.get('cache-control')).toBe('private, no-store')
	expect(response.headers.getSetCookie().filter((cookie) => !cookie.startsWith('pending-verification-email=;'))).toEqual([])
	expect(JSON.stringify(warn.mock.calls)).not.toContain(TOKEN)
	expect(JSON.stringify(warn.mock.calls)).not.toContain('raw upstream text')
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/auth/verify-email')
	expect(init?.method).toBe('POST')
	expect(init?.body).toBe(`{"token":"${TOKEN}"}`)
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({ 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' })
})

it('forgets the pending address only once the email is verified', async () => {
	fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
	expect((await open(`?token=${TOKEN}`)).headers.getSetCookie()).toEqual(['pending-verification-email=; Path=/; Max-Age=0; HttpOnly; SameSite=lax'])
	expect(new Headers(fetchMock.mock.calls[0][1]?.headers).has('x-forwarded-for')).toBe(false)
	fetchMock.mockResolvedValueOnce(json({ code: 'VERIFICATION_LINK_INVALID', message: 'raw upstream text' }, 400))
	expect((await open(`?token=${TOKEN}`)).headers.getSetCookie()).toEqual([])
})

it.each([
	['no token', ''],
	['an empty token', '?token='],
	['a token longer than 128 characters', `?token=${'a'.repeat(129)}`],
])('sends a link with %s to the invalid page without contacting the API', async (_case, query) => {
	const response = await open(query)
	expect(response.headers.get('location')).toBe('http://localhost:3000/verify-email/invalid')
	expect(response.headers.get('cache-control')).toBe('private, no-store')
	expect(response.headers.getSetCookie()).toEqual([])
	expect(fetchMock).not.toHaveBeenCalled()
})

it.each([
	[400, 'VERIFICATION_LINK_INVALID', 'Auth: verify-email failed with VERIFICATION_LINK_INVALID (upstream 400).'],
	[503, 'SERVICE_UNAVAILABLE', 'Auth: verify-email failed with SERVICE_UNAVAILABLE (upstream 503).'],
])('logs a %i failure once by code and status only', async (status, code, line) => {
	fetchMock.mockResolvedValue(json({ code, message: 'raw upstream text' }, status))
	await open(`?token=${TOKEN}`)
	expect(warn).toHaveBeenCalledExactlyOnceWith(line)
})
