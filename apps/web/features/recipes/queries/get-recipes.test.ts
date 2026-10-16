import { afterEach, expect, it, vi } from 'vitest'
import { hydrateRecipePage } from './get-recipes'

vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))
vi.mock('@/features/auth/queries', () => ({ requireSession: async () => ({ status: 'authenticated', user: { id: 'user-1' } }) }))

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('redirects to login when the session expires while fetching the recipe list', async () => {
	vi.stubEnv('RECIPE_API_URL', 'http://api.test')
	vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })))
	await expect(hydrateRecipePage({ sortBy: 'createdAt', order: 'desc' })).rejects.toThrow('NEXT_REDIRECT:/auth/login')
})
