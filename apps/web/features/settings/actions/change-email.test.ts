import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)

import { changeEmail } from './change-email'

const fetchMock = vi.fn<typeof fetch>()
const input = { newEmail: ' Ana.New@Example.com ', currentPassword: ' old password ' }
const user = { id: 'user-1', displayName: 'Ana', email: 'ana@example.com', pendingEmail: 'ana.new@example.com', hasPassword: true, google: null }
const rejection = (status: number, code: string, fieldErrors?: Record<string, readonly string[]>) => new Response(JSON.stringify({ code, message: 'SELECT secrets', ...(fieldErrors ? { fieldErrors } : {}) }), { status })

beforeEach(() => {
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	cache.refresh.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('sends the normalized email and the untrimmed password with only the session cookie, origin and client address, then refreshes the page', async () => {
	fetchMock.mockResolvedValue(new Response(JSON.stringify({ user }), { status: 200 }))
	expect(await changeEmail(input)).toEqual({ status: 'sent' })
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/account/email-change')
	expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error', body: '{"newEmail":"ana.new@example.com","currentPassword":" old password "}' })
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-recipe-client-ip': '203.0.113.9', 'content-type': 'application/json',
	})
	// The session read is never cached: the refresh is what makes the card show the pending address.
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it.each([
	[400, 'INVALID_CURRENT_PASSWORD', { currentPassword: ['SELECT secrets'] }, 'currentPassword', 'Current password is incorrect.'],
	[409, 'EMAIL_ALREADY_EXISTS', undefined, 'newEmail', 'Email already exists.'],
	[400, 'VALIDATION_FAILED', { newEmail: ['This is already your email.', 'second'], sql: ['SELECT secrets'] }, 'newEmail', 'This is already your email.'],
	[400, 'VALIDATION_FAILED', { currentPassword: ['Enter your current password.'], sql: ['SELECT secrets'] }, 'currentPassword', 'Enter your current password.'],
] as const)('puts HTTP %s %s on its field in its own words and refreshes nothing', async (status, code, fieldErrors, field, message) => {
	fetchMock.mockResolvedValue(rejection(status, code, fieldErrors))
	const result = await changeEmail(input)
	expect(result).toEqual({ status: 'invalid', field, message })
	expect(JSON.stringify(result)).not.toMatch(/SELECT|secret|old password/)
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('falls back to a failure in its own words when a rejection names neither field', async () => {
	fetchMock.mockResolvedValue(rejection(400, 'VALIDATION_FAILED', { sql: ['SELECT secrets'] }))
	expect(await changeEmail(input)).toEqual({ status: 'failed', message: 'Check your new email and password and try again.' })
})

it('refreshes the page when the Account turns out to have no password, so the card shows the reason instead of the form', async () => {
	fetchMock.mockResolvedValue(rejection(409, 'PASSWORD_REQUIRED'))
	expect(await changeEmail(input)).toEqual({ status: 'failed', message: 'Set a password before changing your email.' })
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it.each([
	[401, 'session-expired', 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
	[403, 'failed', 'This request could not be verified. Refresh the page and try again.'],
	[429, 'failed', 'Too many attempts. Try again later.'],
	[409, 'failed', 'Couldn’t send the verification link. Try again.'],
	[500, 'failed', 'Couldn’t send the verification link. Try again.'],
	[503, 'failed', 'Couldn’t send the verification link. Try again.'],
	[204, 'failed', 'Couldn’t send the verification link. Try again.'],
])('maps HTTP %s to %s without leaking the response', async (status, expected, message) => {
	fetchMock.mockResolvedValue(new Response(status === 204 ? null : JSON.stringify({ code: 'X', message: 'SELECT secrets' }), { status }))
	expect(await changeEmail(input)).toEqual({ status: expected, message })
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('reports a failure for network errors and timeouts instead of throwing, and refreshes in case the change was recorded', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await changeEmail(input)).toEqual({ status: 'failed', message: 'Couldn’t send the verification link. Try again.' })
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it('rejects invalid input locally on its field with the schema message, without contacting the API', async () => {
	expect(await changeEmail({ ...input, newEmail: 'ana.new' })).toEqual({ status: 'invalid', field: 'newEmail', message: 'Enter a valid email address.' })
	expect(await changeEmail({ ...input, currentPassword: '' })).toEqual({ status: 'invalid', field: 'currentPassword', message: 'Enter your current password.' })
	expect(await changeEmail({ ...input, userId: 'someone-else' })).toEqual({ status: 'failed', message: 'Check your new email and password and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('does not contact the API without a session cookie or a trusted origin', async () => {
	next.cookies = new Map()
	expect(await changeEmail(input)).toMatchObject({ status: 'session-expired' })
	next.cookies = new Map([['better-auth.session_token', 'abc']])
	next.headers = new Headers()
	expect(await changeEmail(input)).toEqual({ status: 'failed', message: 'This request could not be verified. Refresh the page and try again.' })
	expect(fetchMock).not.toHaveBeenCalled()
})
