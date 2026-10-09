import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { deleteRecipe } from './delete'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	cache.refresh.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('deletes with only the session cookie, origin and client address, refreshes the client and redirects with the notice', async () => {
	fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
	await expect(deleteRecipe('recipe-1')).rejects.toThrow('NEXT_REDIRECT:/recipes?notice=recipe-deleted')
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/recipes/recipe-1')
	expect(init).toMatchObject({ method: 'DELETE', cache: 'no-store', redirect: 'error' })
	expect(init?.signal).toBeInstanceOf(AbortSignal)
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9',
	})
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it('treats an already deleted recipe (404) like a successful delete', async () => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'x' }), { status: 404 }))
	await expect(deleteRecipe('recipe-1')).rejects.toThrow('NEXT_REDIRECT:/recipes?notice=recipe-deleted')
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it.each([
	[401, 'session-expired'],
	[403, 'failed'],
	[429, 'failed'],
	[500, 'failed'],
	[503, 'failed'],
	[504, 'failed'],
	[200, 'failed'],
])('maps HTTP %s to %s without redirecting or refreshing', async (status, reason) => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'X', message: 'SELECT secrets' }), { status }))
	const result = await deleteRecipe('recipe-1')
	expect(result).toEqual({ ok: false, reason })
	expect(JSON.stringify(result)).not.toMatch(/SELECT|secret|session_token/)
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('reports a failure for network errors and timeouts instead of throwing', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await deleteRecipe('recipe-1')).toEqual({ ok: false, reason: 'failed' })
	fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
	expect(await deleteRecipe('recipe-1')).toEqual({ ok: false, reason: 'failed' })
})

it('does not contact the API without a session cookie, a trusted origin or a valid id', async () => {
	for (const id of ['', 'x'.repeat(201), 'a\u0000b', 7, null]) expect(await deleteRecipe(id as string)).toEqual({ ok: false, reason: 'failed' })
	next.headers = new Headers()
	expect(await deleteRecipe('recipe-1')).toEqual({ ok: false, reason: 'failed' })
	next.headers = new Headers({ origin: 'http://localhost:3000' })
	next.cookies.delete('better-auth.session_token')
	expect(await deleteRecipe('recipe-1')).toEqual({ ok: false, reason: 'session-expired' })
	expect(fetchMock).not.toHaveBeenCalled()
})
