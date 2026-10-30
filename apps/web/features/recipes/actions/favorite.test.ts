import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))

import { setFavorite } from './favorite'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it.each([
	[true, 'PUT'],
	[false, 'DELETE'],
])('sends favorite=%s as %s with only the session cookie, origin and client address', async (favorite, method) => {
	fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
	expect(await setFavorite('recipe-1', favorite)).toEqual({ ok: true })
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/recipes/recipe-1/favorite')
	expect(init).toMatchObject({ method, cache: 'no-store', redirect: 'error' })
	expect(init?.signal).toBeInstanceOf(AbortSignal)
	expect(init?.body).toBeUndefined()
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-recipe-client-ip': '203.0.113.9',
	})
})

it('encodes the recipe id into the path', async () => {
	fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
	await setFavorite('a/b c', true)
	expect(fetchMock.mock.calls[0][0]).toBe('http://api.example/recipes/a%2Fb%20c/favorite')
})

it.each([
	[401, 'session-expired'],
	[404, 'not-found'],
	[403, 'failed'],
	[429, 'failed'],
	[500, 'failed'],
	[503, 'failed'],
	[200, 'failed'],
])('maps HTTP %s to %s', async (status, reason) => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'X', message: 'upstream text' }), { status }))
	expect(await setFavorite('recipe-1', true)).toEqual({ ok: false, reason })
})

it('reports a failure for network errors and timeouts instead of throwing', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await setFavorite('recipe-1', true)).toEqual({ ok: false, reason: 'failed' })
	fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
	expect(await setFavorite('recipe-1', false)).toEqual({ ok: false, reason: 'failed' })
})

it('does not contact the API without a session cookie or a trusted origin', async () => {
	next.cookies.delete('better-auth.session_token')
	expect(await setFavorite('recipe-1', true)).toEqual({ ok: false, reason: 'session-expired' })
	next.cookies.set('better-auth.session_token', 'abc')
	for (const origin of [undefined, 'null']) {
		next.headers = new Headers(origin ? { origin } : {})
		expect(await setFavorite('recipe-1', true)).toEqual({ ok: false, reason: 'failed' })
	}
	expect(fetchMock).not.toHaveBeenCalled()
})

it('rejects malformed ids and flags without contacting the API', async () => {
	for (const id of ['', 'x'.repeat(201), 'a\u0000b', 42, null, undefined]) {
		expect(await setFavorite(id as string, true)).toEqual({ ok: false, reason: 'failed' })
	}
	expect(await setFavorite('recipe-1', 'yes' as unknown as boolean)).toEqual({ ok: false, reason: 'failed' })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('fails without sending when the API origin is not configured', async () => {
	vi.stubEnv('RECIPE_API_URL', '')
	expect(await setFavorite('recipe-1', true)).toEqual({ ok: false, reason: 'failed' })
	expect(fetchMock).not.toHaveBeenCalled()
})
