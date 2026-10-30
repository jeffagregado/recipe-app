import { beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }),
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))
vi.mock('@/features/auth/queries', () => ({ requireSession: async () => ({ status: 'authenticated', user: { id: 'user-1' } }) }))

import { getCategories } from './get-categories'

const fetchMock = vi.fn<typeof fetch>()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
	vi.unstubAllGlobals()
	fetchMock.mockReset()
	vi.stubGlobal('fetch', fetchMock)
	vi.stubEnv('RECIPE_API_URL', 'http://api.test')
	next.cookies = new Map([['better-auth.session_token', 'tok en'], ['analytics', '1']])
})

it('forwards only the session cookie and client IP, uncached, and returns the validated list in order', async () => {
	const categories = [{ id: 'c2', name: 'Dinner', recipeCount: 3 }, { id: 'c1', name: 'Soup', recipeCount: 0 }]
	fetchMock.mockResolvedValue(json(categories))
	await expect(getCategories()).resolves.toEqual(categories)
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.test/categories')
	expect(init).toMatchObject({ cache: 'no-store', redirect: 'error' })
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({ cookie: 'better-auth.session_token=tok%20en', 'x-recipe-client-ip': '203.0.113.9' })
	expect(init?.signal).toBeInstanceOf(AbortSignal)
})

it('redirects to login when the session has expired', async () => {
	fetchMock.mockResolvedValue(json({ code: 'UNAUTHENTICATED', message: 'no' }, 401))
	await expect(getCategories()).rejects.toThrow('NEXT_REDIRECT:/auth/login')
})

it.each([
	['a server error', () => json({ secret: 'leak-me' }, 500), /failed \(500\)/],
	['invalid data', () => json([{ id: 'c1', name: 'Dinner' }]), /invalid category data/],
	['invalid JSON', () => new Response('<html>leak-me</html>', { status: 200 }), /invalid JSON/],
])('throws a descriptive error for %s instead of an empty list, without leaking details', async (_name, response, message) => {
	fetchMock.mockResolvedValue(response())
	const error = await getCategories().catch((cause: Error) => cause)
	expect(error).toBeInstanceOf(Error)
	expect((error as Error).message).toMatch(message)
	expect((error as Error).message).not.toMatch(/leak-me|api\.test/)
})

it('reports transport failures without the URL', async () => {
	fetchMock.mockRejectedValue(new TypeError('fetch failed: http://api.test/categories'))
	const error = await getCategories().catch((cause: Error) => cause)
	expect((error as Error).message).toMatch(/failed during transport/)
	expect((error as Error).message).not.toMatch(/api\.test/)
})
