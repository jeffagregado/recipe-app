import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)

import { changePassword } from './change-password'

const fetchMock = vi.fn<typeof fetch>()
const input = { currentPassword: ' old password ', newPassword: ' new password 123 ' }
const rejection = (code: string, fieldErrors?: Record<string, readonly string[]>) => new Response(JSON.stringify({ code, message: 'SELECT secrets', ...(fieldErrors ? { fieldErrors } : {}) }), { status: 400 })

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	cache.refresh.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('sends both passwords untrimmed with only the session cookie, origin and client address', async () => {
	fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
	expect(await changePassword(input)).toEqual({ status: 'changed' })
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/account/password')
	expect(init).toMatchObject({ method: 'PUT', cache: 'no-store', redirect: 'error', body: '{"currentPassword":" old password ","newPassword":" new password 123 "}' })
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-recipe-client-ip': '203.0.113.9', 'content-type': 'application/json',
	})
	// This session is kept and nothing the page shows has changed, so there is nothing to refresh.
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('puts a refused current password on its field in its own words', async () => {
	fetchMock.mockResolvedValue(rejection('INVALID_CURRENT_PASSWORD', { currentPassword: ['SELECT secrets'] }))
	const result = await changePassword(input)
	expect(result).toEqual({ status: 'invalid', field: 'currentPassword', message: 'Current password is incorrect.' })
	expect(JSON.stringify(result)).not.toMatch(/SELECT|secret|password 123/)
})

it.each([
	['newPassword', { newPassword: ['Use at least 12 characters.', 'second'], sql: ['SELECT secrets'] }, 'Use at least 12 characters.'],
	['currentPassword', { currentPassword: ['Enter your current password.'], sql: ['SELECT secrets'] }, 'Enter your current password.'],
] as const)('passes on only the %s message of a rejected change', async (field, fieldErrors, message) => {
	fetchMock.mockResolvedValue(rejection('VALIDATION_FAILED', fieldErrors))
	expect(await changePassword(input)).toEqual({ status: 'invalid', field, message })
})

it('falls back to a failure in its own words when a rejection names neither password', async () => {
	fetchMock.mockResolvedValue(rejection('VALIDATION_FAILED', { sql: ['SELECT secrets'] }))
	expect(await changePassword(input)).toEqual({ status: 'failed', message: 'Check both passwords and try again.' })
})

it.each([
	[401, 'session-expired', 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
	[403, 'failed', 'This request could not be verified. Refresh the page and try again.'],
	[429, 'failed', 'Too many attempts. Try again in a few minutes.'],
	[500, 'failed', 'Couldn’t change your password. Try again.'],
	[503, 'failed', 'Couldn’t change your password. Try again.'],
	[200, 'failed', 'Couldn’t change your password. Try again.'],
])('maps HTTP %s to %s without leaking the response', async (status, expected, message) => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ code: 'X', message: 'SELECT secrets' }), { status }))
	expect(await changePassword(input)).toEqual({ status: expected, message })
})

it('says the outcome is unknown for network errors and timeouts instead of throwing', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await changePassword(input)).toEqual({ status: 'failed', message: 'We couldn’t confirm the change. If your new password doesn’t work the next time you log in, use the old one.' })
})

it('rejects an invalid password locally on its field with the schema message, without contacting the API', async () => {
	expect(await changePassword({ ...input, newPassword: 'x'.repeat(11) })).toEqual({ status: 'invalid', field: 'newPassword', message: 'Use at least 12 characters.' })
	expect(await changePassword({ ...input, currentPassword: '' })).toEqual({ status: 'invalid', field: 'currentPassword', message: 'Enter your current password.' })
	expect(await changePassword({ ...input, userId: 'someone-else' })).toEqual({ status: 'failed', message: 'Check both passwords and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('does not contact the API without a session cookie or a trusted origin', async () => {
	next.cookies = new Map()
	expect(await changePassword(input)).toMatchObject({ status: 'session-expired' })
	next.cookies = new Map([['better-auth.session_token', 'abc']])
	next.headers = new Headers()
	expect(await changePassword(input)).toEqual({ status: 'failed', message: 'This request could not be verified. Refresh the page and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
})
