import { beforeEach, expect, it, vi } from 'vitest'
import { recipeDetailFixture } from './recipe-detail.fixture'

const next = vi.hoisted(() => ({ cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))
vi.mock('@/features/auth/queries', () => ({ requireSession: async () => ({ status: 'authenticated', user: { id: 'user-1' } }) }))

import { getRecipe } from './get-recipe'

const fetchMock = vi.fn<typeof fetch>()
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
	vi.unstubAllGlobals()
	fetchMock.mockReset()
	vi.stubGlobal('fetch', fetchMock)
	vi.stubEnv('RECIPE_API_URL', 'http://api.test')
	next.cookies = new Map([['better-auth.session_token', 'tok en'], ['analytics', '1']])
})

it('forwards only the session cookie, uncached, and returns the validated recipe', async () => {
	const recipe = recipeDetailFixture()
	fetchMock.mockResolvedValue(json(recipe))
	await expect(getRecipe('a b/c')).resolves.toEqual(recipe)
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.test/recipes/a%20b%2Fc')
	expect(init).toMatchObject({ cache: 'no-store', redirect: 'error', headers: { Cookie: 'better-auth.session_token=tok%20en' } })
	expect(init?.signal).toBeInstanceOf(AbortSignal)
})

it('returns null for a 404 and for ids that cannot exist without calling the API', async () => {
	fetchMock.mockResolvedValue(json({ code: 'NOT_FOUND', message: 'Recipe not found' }, 404))
	await expect(getRecipe('missing')).resolves.toBeNull()
	fetchMock.mockClear()
	await expect(getRecipe('')).resolves.toBeNull()
	await expect(getRecipe('x'.repeat(201))).resolves.toBeNull()
	expect(fetchMock).not.toHaveBeenCalled()
})

it('redirects to the landing page when the session has expired', async () => {
	fetchMock.mockResolvedValue(json({ code: 'UNAUTHORIZED', message: 'no' }, 401))
	await expect(getRecipe('r1')).rejects.toThrow('NEXT_REDIRECT:/')
})

it.each([
	['a server error', () => json({ secret: 'leak-me' }, 500), /failed \(500\)/],
	['invalid data', () => json({ id: 'r1' }), /invalid recipe data/],
	['invalid JSON', () => new Response('<html>leak-me</html>', { status: 200 }), /invalid JSON/],
])('throws a descriptive error for %s without leaking details', async (_name, response, message) => {
	fetchMock.mockResolvedValue(response())
	const error = await getRecipe('r1').catch((cause: Error) => cause)
	expect(error).toBeInstanceOf(Error)
	expect((error as Error).message).toMatch(message)
	expect((error as Error).message).not.toMatch(/leak-me|api\.test/)
})

it('reports transport failures without the URL', async () => {
	fetchMock.mockRejectedValue(new TypeError('connect ECONNREFUSED http://api.test/recipes/r1'))
	const error = await getRecipe('r1').catch((cause: Error) => cause)
	expect((error as Error).message).toMatch(/transport/)
	expect((error as Error).message).not.toMatch(/api\.test/)
})
