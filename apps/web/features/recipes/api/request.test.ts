import { afterEach, expect, it, vi } from 'vitest'
import { fetchRecipePage } from './request'
import { SessionExpiredError } from '@/features/auth/errors'

afterEach(() => vi.unstubAllGlobals())

it('uses same-origin credentials and distinguishes session expiry from outages', async () => {
	const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
	vi.stubGlobal('fetch', fetcher)
	await expect(fetchRecipePage('/backend/recipes', { sortBy: 'title', order: 'asc' }, 2)).rejects.toBeInstanceOf(SessionExpiredError)
	const [url, options] = fetcher.mock.calls[0]
	expect(String(url)).toContain('/backend/recipes?page=2&limit=20&sortBy=title&order=asc')
	expect(options).toMatchObject({ cache: 'no-store', credentials: 'same-origin' })
})

it('asks the API for favorites only when that filter is on', async () => {
	const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
	vi.stubGlobal('fetch', fetcher)
	await expect(fetchRecipePage('/backend/recipes', { sortBy: 'title', order: 'asc', favorites: true }, 1)).rejects.toBeInstanceOf(SessionExpiredError)
	await expect(fetchRecipePage('/backend/recipes', { sortBy: 'title', order: 'asc' }, 1)).rejects.toBeInstanceOf(SessionExpiredError)
	const [on, off] = fetcher.mock.calls.map(([url]) => new URL(String(url), 'http://localhost').searchParams)
	expect(on.get('favorites')).toBe('true')
	expect(off.has('favorites')).toBe(false)
})
