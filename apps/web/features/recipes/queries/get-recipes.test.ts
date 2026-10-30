import { afterEach, expect, it, vi } from 'vitest'
import { hydrateRecipePage } from './get-recipes'

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }), cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))
vi.mock('@/features/auth/queries', () => ({ requireSession: async () => ({ status: 'authenticated', user: { id: 'user-1' } }) }))

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('redirects to login when the session expires while fetching the recipe list, having sent the client IP', async () => {
	vi.stubEnv('RECIPE_API_URL', 'http://api.test')
	const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }))
	vi.stubGlobal('fetch', fetchMock)
	await expect(hydrateRecipePage({ sortBy: 'createdAt', order: 'desc' })).rejects.toThrow('NEXT_REDIRECT:/auth/login')
	expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-recipe-client-ip')).toBe('203.0.113.9')
})
