import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }) }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { getSession, requireSession } from './queries'

const fetchMock = vi.fn<typeof fetch>()
const body = { user: { id: 'user-1', displayName: 'Test Owner', email: 'owner@example.invalid', pendingEmail: null, hasPassword: true }, expiresAt: '2030-01-01T00:00:00.000Z' }

beforeEach(() => {
	next.cookies.clear()
	fetchMock.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('is anonymous without a session cookie and does not call the API', async () => {
	expect(await getSession()).toEqual({ status: 'anonymous' })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('forwards only the session cookie and returns the authenticated user', async () => {
	next.cookies.set('better-auth.session_token', 'abc')
	next.cookies.set('analytics', 'private')
	fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
	expect(await getSession()).toEqual({ status: 'authenticated', ...body })
	expect(fetchMock.mock.calls[0][0]).toBe('http://api.example/auth/session')
	expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', headers: { Cookie: 'better-auth.session_token=abc' } })
})

it('treats 401 as signed out and redirects private routes to the root', async () => {
	next.cookies.set('better-auth.session_token', 'abc')
	fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
	expect(await getSession()).toEqual({ status: 'anonymous' })
	await expect(requireSession()).rejects.toThrow('NEXT_REDIRECT:/')
})

it.each([
	['an outage status', () => new Response(null, { status: 503 })],
	['invalid JSON', () => new Response('not json', { status: 200 })],
	['invalid session data', () => new Response('{}', { status: 200 })],
])('throws on %s instead of rendering signed out', async (_name, response) => {
	next.cookies.set('better-auth.session_token', 'abc')
	fetchMock.mockResolvedValue(response())
	await expect(getSession()).rejects.toMatchObject({ name: 'AuthServiceError' })
})

it('throws when the API is unreachable', async () => {
	next.cookies.set('better-auth.session_token', 'abc')
	fetchMock.mockRejectedValue(new TypeError('Test transport failed'))
	await expect(getSession()).rejects.toMatchObject({ name: 'AuthServiceError' })
})
