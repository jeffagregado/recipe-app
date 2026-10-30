import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)

import { CATEGORY_MESSAGES } from './results'
import { saveCategories } from './save-categories'

const fetchMock = vi.fn<typeof fetch>()
const rows = [{ id: 'c1', name: 'Dinner' }, { name: 'Soup' }]
const stored = [{ id: 'c1', name: 'Dinner', recipeCount: 3 }, { id: 'c2', name: 'Soup', recipeCount: 0 }]
const rejection = (fieldErrors: Record<string, string[]>) => new Response(JSON.stringify({ code: 'VALIDATION_FAILED', message: 'SELECT secrets', fieldErrors }), { status: 400 })

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	cache.refresh.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('sends the whole set as JSON with only the session cookie, origin and client address, then refreshes the router', async () => {
	fetchMock.mockResolvedValue(Response.json(stored))
	expect(await saveCategories([{ id: 'c1', name: '  Dinner ' }, { name: 'Soup' }])).toEqual({ status: 'saved', categories: stored })
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/categories')
	expect(init).toMatchObject({ method: 'PUT', cache: 'no-store', redirect: 'error', body: JSON.stringify(rows) })
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-recipe-client-ip': '203.0.113.9', 'content-type': 'application/json',
	})
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it('still reports and refreshes a confirmed save whose answer cannot be read', async () => {
	fetchMock.mockResolvedValue(new Response('not json', { status: 200 }))
	expect(await saveCategories(rows)).toEqual({ status: 'saved', categories: null })
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it('maps a rejected row to that row and drops every other field and the API message', async () => {
	fetchMock.mockResolvedValue(rejection({ '1.name': ['“Dinner” already exists. Choose a different name.'], categories: ['Keep up to 10 categories.'], sql: ['SELECT secrets'], '1.name.extra': ['x'] }))
	const result = await saveCategories(rows)
	expect(result).toEqual({ status: 'invalid', message: CATEGORY_MESSAGES.invalid, fieldErrors: { '1.name': ['“Dinner” already exists. Choose a different name.'], categories: ['Keep up to 10 categories.'] } })
	expect(JSON.stringify(result)).not.toMatch(/SELECT|secret/)
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('reports a row id the API no longer knows as a list changed elsewhere', async () => {
	fetchMock.mockResolvedValue(rejection({ '0.id': ['This category no longer exists.'] }))
	expect(await saveCategories(rows)).toEqual({ status: 'stale', message: 'Your categories changed in another tab. Reload.' })
	expect(cache.refresh).not.toHaveBeenCalled()
})

it.each([
	[401, 'session-expired', CATEGORY_MESSAGES.sessionExpired],
	[403, 'failed', CATEGORY_MESSAGES.unverified],
	[429, 'failed', CATEGORY_MESSAGES.rateLimited],
	[500, 'failed', CATEGORY_MESSAGES.failed],
	[503, 'failed', CATEGORY_MESSAGES.failed],
	[204, 'failed', CATEGORY_MESSAGES.failed],
])('maps HTTP %s to %s without refreshing or leaking the response', async (status, expected, message) => {
	fetchMock.mockResolvedValue(new Response(status === 204 ? null : JSON.stringify({ code: 'X', message: 'SELECT secrets' }), { status }))
	expect(await saveCategories(rows)).toEqual({ status: expected, message })
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('reports a failure for network errors and timeouts instead of throwing', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await saveCategories(rows)).toEqual({ status: 'failed', message: 'Couldn’t save categories. Try again.' })
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('rejects an invalid set locally, on the row at fault, without contacting the API', async () => {
	expect(await saveCategories([{ id: 'c1', name: 'Dinner' }, { name: 'dinner' }])).toMatchObject({ status: 'invalid', fieldErrors: { '1.name': [expect.stringContaining('already exists')] } })
	expect(await saveCategories('Dinner')).toMatchObject({ status: 'invalid' })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('does not contact the API without a session cookie or a trusted origin', async () => {
	next.cookies = new Map()
	expect(await saveCategories(rows)).toEqual({ status: 'session-expired', message: CATEGORY_MESSAGES.sessionExpired })
	next.cookies = new Map([['better-auth.session_token', 'abc']])
	next.headers = new Headers()
	expect(await saveCategories(rows)).toEqual({ status: 'failed', message: CATEGORY_MESSAGES.unverified })
	expect(fetchMock).not.toHaveBeenCalled()
})
