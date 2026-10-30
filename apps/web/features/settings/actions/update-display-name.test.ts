import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)

import { DISPLAY_NAME_MESSAGES } from './results'
import { updateDisplayName } from './update-display-name'

const fetchMock = vi.fn<typeof fetch>()
const stored = { user: { id: 'u1', displayName: 'Ana María' } }
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

it('sends the trimmed name with only the session cookie, origin and client address, then refreshes the router', async () => {
	fetchMock.mockResolvedValue(Response.json(stored))
	expect(await updateDisplayName({ displayName: '  Ana María ' })).toEqual({ status: 'saved', displayName: 'Ana María' })
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/account/display-name')
	expect(init).toMatchObject({ method: 'PUT', cache: 'no-store', redirect: 'error', body: '{"displayName":"Ana María"}' })
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-recipe-client-ip': '203.0.113.9', 'content-type': 'application/json',
	})
	// The sidebar reads the session uncached on every render, so a router refresh is what shows the new name.
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it('still reports and refreshes a confirmed save whose answer cannot be read', async () => {
	fetchMock.mockResolvedValue(new Response('not json', { status: 200 }))
	expect(await updateDisplayName({ displayName: ' Ana ' })).toEqual({ status: 'saved', displayName: 'Ana' })
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it('passes on only the display name message of a rejected save, dropping other fields and the API message', async () => {
	fetchMock.mockResolvedValue(rejection({ displayName: ['Use at most 100 characters.', 'second'], sql: ['SELECT secrets'], email: ['Unexpected field.'] }))
	const result = await updateDisplayName({ displayName: 'Ana' })
	expect(result).toEqual({ status: 'invalid', message: 'Use at most 100 characters.' })
	expect(JSON.stringify(result)).not.toMatch(/SELECT|secret/)
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('falls back to its own wording when a rejection names no display name error', async () => {
	fetchMock.mockResolvedValue(rejection({ sql: ['SELECT secrets'] }))
	expect(await updateDisplayName({ displayName: 'Ana' })).toEqual({ status: 'invalid', message: 'Check your display name and try again.' })
})

it.each([
	[401, 'session-expired', 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
	[403, 'failed', 'This request could not be verified. Refresh the page and try again.'],
	[429, 'failed', 'Too many saves. Try again in a moment.'],
	[500, 'failed', 'Couldn’t save your display name. Try again.'],
	[503, 'failed', 'Couldn’t save your display name. Try again.'],
	[204, 'failed', 'Couldn’t save your display name. Try again.'],
])('maps HTTP %s to %s without refreshing or leaking the response', async (status, expected, message) => {
	fetchMock.mockResolvedValue(new Response(status === 204 ? null : JSON.stringify({ code: 'X', message: 'SELECT secrets' }), { status }))
	expect(await updateDisplayName({ displayName: 'Ana' })).toEqual({ status: expected, message })
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('reports a failure for network errors and timeouts instead of throwing', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await updateDisplayName({ displayName: 'Ana' })).toEqual({ status: 'failed', message: DISPLAY_NAME_MESSAGES.failed })
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('rejects an invalid name locally with the schema message, without contacting the API', async () => {
	expect(await updateDisplayName({ displayName: '   ' })).toEqual({ status: 'invalid', message: 'Enter a display name.' })
	expect(await updateDisplayName('Ana')).toEqual({ status: 'invalid', message: 'Check your display name and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('does not contact the API without a session cookie or a trusted origin', async () => {
	next.cookies = new Map()
	expect(await updateDisplayName({ displayName: 'Ana' })).toEqual({ status: 'session-expired', message: DISPLAY_NAME_MESSAGES.sessionExpired })
	next.cookies = new Map([['better-auth.session_token', 'abc']])
	next.headers = new Headers()
	expect(await updateDisplayName({ displayName: 'Ana' })).toEqual({ status: 'failed', message: DISPLAY_NAME_MESSAGES.unverified })
	expect(fetchMock).not.toHaveBeenCalled()
	expect(cache.refresh).not.toHaveBeenCalled()
})
