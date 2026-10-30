// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const next = vi.hoisted(() => ({ headers: new Headers(), cookies: new Map<string, string>() }))
vi.mock('next/headers', () => ({
	headers: async () => next.headers,
	cookies: async () => ({ get: (name: string) => next.cookies.has(name) ? { value: next.cookies.get(name)! } : undefined }),
}))
const session = vi.hoisted(() => ({ result: 'authenticated' as 'authenticated' | 'anonymous' | 'error' }))
vi.mock('@/features/auth/queries', () => ({
	getSession: async () => {
		if (session.result === 'error') throw new Error('session service down')
		return session.result === 'anonymous' ? { status: 'anonymous' } : { status: 'authenticated', user: { id: 'user-1' } }
	},
}))
vi.mock('server-only', () => ({}))

import { UPDATE_MESSAGES, type SaveRecipeResponse } from '@/features/recipes/form/lib/save-recipe-result'
import { handleUpdateRecipe } from './save-route'

let lastStatus = 0
/** Sends the save the way the browser does: same-site Origin, the page's Host, a JSON body, and whatever the test put in the headers. */
async function updateRecipe(recipeId: string, body: unknown) {
	const headers = new Headers(next.headers)
	headers.set('host', 'localhost:3000')
	headers.set('content-type', 'application/json')
	const response = await handleUpdateRecipe(new Request(`http://localhost:3000/api/recipes/${encodeURIComponent(recipeId)}`, { method: 'PATCH', headers, body: JSON.stringify(body) }), recipeId)
	lastStatus = response.status
	expect(response.headers.get('cache-control')).toBe('private, no-store')
	return await response.json() as SaveRecipeResponse & { message?: string }
}

const KEY = '2c1d3c2e-8a9b-4f6a-9d1f-0a7f6a1b2c3d'
const PHOTO_ID = '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70'
const fetchMock = vi.fn<typeof fetch>()
const metadata = {
	title: 'Pasta', description: null, categoryIds: ['category-dinner'], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
	ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
	cover: 'keep',
	instructions: [{ id: 's1', description: 'Boil', image: 'keep' }, { id: null, description: 'Serve', image: { pendingPhotoId: PHOTO_ID } }],
}
const payload = (overrides: Record<string, unknown> = {}) => ({ recipe: metadata, idempotencyKey: KEY, ...overrides })
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
	session.result = 'authenticated'
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('PATCHes the recipe with only the session cookie, origin, key and client address, then answers with the saved id', async () => {
	fetchMock.mockResolvedValue(json({ id: 'recipe/1' }, 200))
	expect(await updateRecipe('recipe/1', payload())).toEqual({ status: 'saved', id: 'recipe/1' })
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/recipes/recipe%2F1')
	expect(init).toMatchObject({ method: 'PATCH', cache: 'no-store', redirect: 'error' })
	expect(init?.signal).toBeInstanceOf(AbortSignal)
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'idempotency-key': KEY, 'x-forwarded-for': '203.0.113.9', 'content-type': 'application/json',
	})
	expect(typeof init?.body).toBe('string')
	expect(JSON.parse(init?.body as string)).toEqual(metadata)
})

it.each<[string, unknown, string[]]>([
	['a reused step id', payload({ recipe: { ...metadata, instructions: [{ id: 's1', description: 'a', image: 'keep' }, { id: 's1', description: 'b', image: 'keep' }] } }), ['instructions']],
	['a kept photo on a new step', payload({ recipe: { ...metadata, instructions: [{ id: null, description: 'a', image: 'keep' }] } }), ['instructions.0.image']],
	['a blank title', payload({ recipe: { ...metadata, title: ' ' } }), ['title']],
	['a key that is not a UUID', payload({ idempotencyKey: 'not-a-uuid' }), ['idempotencyKey']],
])('rejects %s locally with dotted field errors and never calls the API', async (_name, body, fields) => {
	const result = await updateRecipe('r1', body)
	expect(result.status).toBe('invalid')
	expect(Object.keys((result as { fieldErrors: object }).fieldErrors).sort()).toEqual(fields)
	expect(fetchMock).not.toHaveBeenCalled()
})

it('reports a recipe that no longer exists (404) with its own result and saves nothing', async () => {
	fetchMock.mockResolvedValue(json({ code: 'NOT_FOUND', message: 'x' }, 404))
	expect(await updateRecipe('r1', payload())).toEqual({ status: 'not-found', message: UPDATE_MESSAGES.notFound })
})

it('maps the remaining statuses exactly as create does, with update wording', async () => {
	const cases: [Response, string, string?][] = [
		[json({ code: 'VALIDATION_FAILED', message: 'x', fieldErrors: { 'instructions.0.image': ['Nope'] } }, 400), 'invalid', UPDATE_MESSAGES.invalid],
		[json({ code: 'UNAUTHORIZED', message: 'x' }, 401), 'session-expired', UPDATE_MESSAGES.sessionExpired],
		[json({ code: 'ORIGIN_REJECTED', message: 'x' }, 403), 'failed', UPDATE_MESSAGES.unverified],
		[json({ code: 'IDEMPOTENCY_IN_PROGRESS', message: 'x' }, 409), 'unknown', UPDATE_MESSAGES.unknown],
		[json({ code: 'IDEMPOTENCY_CONFLICT', message: 'x' }, 409), 'failed', UPDATE_MESSAGES.failed],
		[json({ code: 'PAYLOAD_TOO_LARGE', message: 'x' }, 413), 'invalid', UPDATE_MESSAGES.invalid],
		[json({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'x' }, 415), 'failed', UPDATE_MESSAGES.failed],
		[json({ code: 'RATE_LIMITED', message: 'x' }, 429), 'failed', UPDATE_MESSAGES.rateLimited],
		[json({ code: 'UNAVAILABLE', message: 'x' }, 503), 'failed', UPDATE_MESSAGES.failed],
		[json({ code: 'DEADLINE', message: 'x' }, 504), 'unknown', UPDATE_MESSAGES.unknown],
		[json({ code: 'BOOM', message: 'x' }, 500), 'unknown'],
		[json({ nope: true }, 200), 'unknown'],
		[new Response('not json', { status: 200 }), 'unknown'],
	]
	for (const [response, status, message] of cases) {
		fetchMock.mockResolvedValueOnce(response)
		const result = await updateRecipe('r1', payload())
		expect(result.status).toBe(status)
		if (message) expect(result.message).toBe(message)
	}
})

it('treats network errors and timeouts as an unknown outcome', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await updateRecipe('r1', payload())).toEqual({ status: 'unknown', message: UPDATE_MESSAGES.unknown })
	fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
	expect(await updateRecipe('r1', payload())).toEqual({ status: 'unknown', message: UPDATE_MESSAGES.unknown })
})

it('refuses without contacting the API: bad id, no origin, no session cookie, stale session, missing configuration', async () => {
	for (const id of ['', 'x'.repeat(201), 'a\u0000b']) {
		expect(await updateRecipe(id, payload())).toEqual({ status: 'not-found', message: UPDATE_MESSAGES.notFound })
	}
	next.headers = new Headers()
	expect(await updateRecipe('r1', payload())).toEqual({ status: 'failed', message: UPDATE_MESSAGES.unverified })
	next.headers = new Headers({ origin: 'http://localhost:3000' })
	next.cookies.delete('better-auth.session_token')
	expect(await updateRecipe('r1', payload())).toEqual({ status: 'session-expired', message: UPDATE_MESSAGES.sessionExpired })
	expect(lastStatus).toBe(401)
	next.cookies.set('better-auth.session_token', 'abc')
	session.result = 'anonymous'
	expect(await updateRecipe('r1', payload())).toEqual({ status: 'session-expired', message: UPDATE_MESSAGES.sessionExpired })
	session.result = 'error'
	expect(await updateRecipe('r1', payload())).toEqual({ status: 'failed', message: UPDATE_MESSAGES.failed })
	session.result = 'authenticated'
	vi.stubEnv('RECIPE_API_URL', '')
	expect(await updateRecipe('r1', payload())).toEqual({ status: 'failed', message: UPDATE_MESSAGES.failed })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('never leaks cookies, upstream bodies or stack traces in results', async () => {
	fetchMock.mockResolvedValue(json({ code: 'BOOM', message: 'SELECT * FROM secrets; better-auth.session_token=abc', stack: 'at db.ts:1' }, 500))
	const serialized = JSON.stringify(await updateRecipe('r1', payload()))
	expect(serialized).not.toMatch(/SELECT|session_token|secret-value|db\.ts/)
})
