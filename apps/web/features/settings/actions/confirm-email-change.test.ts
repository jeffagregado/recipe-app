import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>(), set: vi.fn() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined, set: next.set }),
}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { confirmEmailChange } from './confirm-email-change'

const fetchMock = vi.fn<typeof fetch>()
const warn = vi.spyOn(console, 'warn')
const token = 't'.repeat(43)
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'better-auth.session_token=upstream; Path=/' } })

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	next.set.mockReset()
	fetchMock.mockReset()
	warn.mockReset().mockImplementation(() => {})
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('posts the token with only the session cookie, origin and client address, and returns a signed-in person to Settings with a notice', async () => {
	fetchMock.mockResolvedValue(json({ signedIn: true }, 200))
	await expect(confirmEmailChange({ token })).rejects.toThrow('NEXT_REDIRECT:/settings?notice=email-changed')
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/account/email-change/confirm')
	expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error', body: JSON.stringify({ token }) })
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', 'content-type': 'application/json',
	})
	// The session the browser holds is kept as it is: nothing the API sets is passed on.
	expect(next.set).not.toHaveBeenCalled()
})

it.each([
	['a browser that is not signed in', new Map<string, string>(), { signedIn: false }],
	['a browser signed in to another Account', new Map([['better-auth.session_token', 'abc']]), { signedIn: false }],
	// The change is confirmed even when its answer cannot be read; the login page is the safe place to land.
	['an answer that cannot be read', new Map([['better-auth.session_token', 'abc']]), { token: 'x' }],
])('sends %s to the login page with a notice and touches no cookie', async (_case, cookies, body) => {
	next.cookies = cookies
	fetchMock.mockResolvedValue(json(body, 200))
	await expect(confirmEmailChange({ token })).rejects.toThrow('NEXT_REDIRECT:/?notice=email-changed-login')
	expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('cookie')).toBe(cookies.size ? 'better-auth.session_token=abc' : null)
	expect(next.set).not.toHaveBeenCalled()
})

it.each([
	[400, 'EMAIL_CHANGE_LINK_INVALID'],
	[400, 'VALIDATION_FAILED'],
])('reports HTTP %s %s as a link that cannot be used, and logs the code only', async (status, code) => {
	fetchMock.mockResolvedValue(json({ code, message: 'SELECT secrets' }, status))
	expect(await confirmEmailChange({ token })).toEqual({ status: 'invalid' })
	expect(warn).toHaveBeenCalledExactlyOnceWith(`Auth: confirm-email-change failed with ${code} (upstream ${status}).`)
})

it.each([
	[429, 'RATE_LIMITED', 'Too many attempts. Please wait and try again.'],
	[403, 'ORIGIN_REJECTED', 'This request could not be verified. Refresh the page and try again.'],
	[503, 'SERVICE_UNAVAILABLE', 'We could not confirm your new email. Please try again.'],
	[500, 'INTERNAL_ERROR', 'We could not confirm your new email. Please try again.'],
])('reports HTTP %s as a failure the person can retry, without leaking the response or the token', async (status, code, message) => {
	fetchMock.mockResolvedValue(json({ code, message: 'SELECT secrets' }, status))
	const result = await confirmEmailChange({ token })
	expect(result).toEqual({ status: 'failed', message })
	expect(warn).toHaveBeenCalledOnce()
	expect(JSON.stringify(warn.mock.calls)).not.toContain(token)
})

it('reports a failure for network errors and timeouts instead of throwing', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await confirmEmailChange({ token })).toEqual({ status: 'failed', message: 'We could not confirm your new email. Please try again.' })
})

it('treats a missing or malformed token as an unusable link without contacting the API', async () => {
	for (const input of [{}, { token: '' }, { token: 't'.repeat(129) }, { token, userId: 'someone-else' }, undefined]) {
		expect(await confirmEmailChange(input), JSON.stringify(input)).toEqual({ status: 'invalid' })
	}
	expect(fetchMock).not.toHaveBeenCalled()
})

it.each([undefined, 'null'])('refuses the Origin %s without contacting the API', async (origin) => {
	next.headers = new Headers(origin ? { origin } : {})
	expect(await confirmEmailChange({ token })).toEqual({ status: 'failed', message: 'This request could not be verified. Refresh the page and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
})
