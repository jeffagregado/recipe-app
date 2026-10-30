// @vitest-environment node
import { RECIPE_LIMITS } from '@recipe-app/contracts/types'
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

import { SAVE_MESSAGES, type SaveRecipeResponse } from '@/features/recipes/form/lib/save-recipe-result'
import { handleCreateRecipe } from './save-route'

let lastStatus = 0
/** Sends a body the way the browser does: same-site Origin, the page's Host, and whatever the test put in the headers. */
async function send(body: BodyInit, extra: Record<string, string> = { 'content-type': 'application/json' }) {
	const headers = new Headers(next.headers)
	headers.set('host', 'localhost:3000')
	for (const [name, value] of Object.entries(extra)) headers.set(name, value)
	const response = await handleCreateRecipe(new Request('http://localhost:3000/api/recipes', { method: 'POST', headers, body }))
	lastStatus = response.status
	expect(response.headers.get('cache-control')).toBe('private, no-store')
	return await response.json() as SaveRecipeResponse & { message?: string }
}

const KEY = '2c1d3c2e-8a9b-4f6a-9d1f-0a7f6a1b2c3d'
const COVER_ID = '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70'
const STEP_PHOTO_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const fetchMock = vi.fn<typeof fetch>()
const metadata = {
	title: 'Pasta', description: null, categoryIds: ['category-dinner'], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
	ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
	cover: { pendingPhotoId: COVER_ID },
	instructions: [{ description: 'Boil', image: { pendingPhotoId: STEP_PHOTO_ID } }, { description: 'Serve' }],
}
const payload = (overrides: Record<string, unknown> = {}) => ({ recipe: metadata, idempotencyKey: KEY, ...overrides })
const saveRecipe = (body: unknown = payload()) => send(JSON.stringify(body))
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const UNREADABLE = { status: 'invalid', message: SAVE_MESSAGES.invalid, fieldErrors: { recipe: ['The recipe details could not be read.'] } }

beforeEach(() => {
	session.result = 'authenticated'
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('forwards the metadata as JSON with only the session cookie, origin, key and client address, then answers with the saved id', async () => {
	fetchMock.mockResolvedValue(json({ id: 'recipe/1' }, 201))
	expect(await saveRecipe()).toEqual({ status: 'saved', id: 'recipe/1' })
	expect(lastStatus).toBe(200)
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/recipes')
	expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error' })
	expect(init?.signal).toBeInstanceOf(AbortSignal)
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'idempotency-key': KEY, 'x-forwarded-for': '203.0.113.9', 'content-type': 'application/json',
	})
	expect(typeof init?.body).toBe('string')
	expect(JSON.parse(init?.body as string)).toEqual(metadata)
})

it('sends the web proxy secret, without surrounding whitespace, on a recipe write and never back to the browser', async () => {
	vi.stubEnv('RECIPE_WEB_PROXY_SECRET', ` ${'w'.repeat(40)}
`)
	fetchMock.mockResolvedValue(json({ id: 'recipe/1' }, 201))
	expect(await saveRecipe()).toEqual({ status: 'saved', id: 'recipe/1' })
	const [, init] = fetchMock.mock.calls[0]
	expect(new Headers(init?.headers).get('x-recipe-web-secret')).toBe('w'.repeat(40))
})

it('treats a 200 replay like a first save', async () => {
	fetchMock.mockResolvedValue(json({ id: 'r1' }, 200))
	expect(await saveRecipe()).toEqual({ status: 'saved', id: 'r1' })
})

it('refuses a missing or null Origin without contacting the API', async () => {
	for (const origin of [undefined, 'null']) {
		next.headers = new Headers(origin ? { origin } : {})
		expect(await saveRecipe()).toEqual({ status: 'failed', message: SAVE_MESSAGES.unverified })
		expect(lastStatus).toBe(403)
	}
	expect(fetchMock).not.toHaveBeenCalled()
})

it('refuses a request from another site with 403 before checking the session or reading the body', async () => {
	next.headers.set('origin', 'https://evil.example')
	expect(await saveRecipe()).toEqual({ status: 'failed', message: SAVE_MESSAGES.unverified })
	expect(lastStatus).toBe(403)
	expect(fetchMock).not.toHaveBeenCalled()
})

function multipartSave() {
	const data = new FormData()
	data.append('recipe', JSON.stringify(metadata))
	data.append('idempotencyKey', KEY)
	data.append('cover', new File([new Uint8Array(4)], 'cover.png', { type: 'image/png' }))
	return data
}

it.each<[string, () => Promise<unknown>]>([
	['a multipart save', () => send(multipartSave(), {})],
	['a plain-text body', () => send(JSON.stringify(payload()), { 'content-type': 'text/plain' })],
	['JSON that does not parse', () => send('{not json')],
	['JSON that is not an object', () => saveRecipe([payload()])],
	['an object with another field', () => saveRecipe(payload({ cover: 'cover.png' }))],
])('refuses %s as unreadable without contacting the API', async (_name, save) => {
	expect(await save()).toEqual(UNREADABLE)
	expect(lastStatus).toBe(200)
	expect(fetchMock).not.toHaveBeenCalled()
})

it.each<[string, () => Promise<unknown>]>([
	['declared', () => send('x', { 'content-type': 'application/json', 'content-length': String(RECIPE_LIMITS.metadataBytes + 2048) })],
	['sent without a declared length', () => saveRecipe(payload({ recipe: { ...metadata, notes: 'x'.repeat(RECIPE_LIMITS.metadataBytes + 1024) } }))],
])('answers 413 for a body over a recipe save, %s, without contacting the API', async (_name, save) => {
	expect(await save()).toEqual({ status: 'invalid', message: SAVE_MESSAGES.invalid, fieldErrors: { recipe: ['The recipe is too large to save.'] } })
	expect(lastStatus).toBe(413)
	expect(fetchMock).not.toHaveBeenCalled()
})

it('reports an expired session without calling the API when there is no session cookie', async () => {
	next.cookies.delete('better-auth.session_token')
	expect(await saveRecipe()).toEqual({ status: 'session-expired', message: SAVE_MESSAGES.sessionExpired })
	expect(lastStatus).toBe(401)
	expect(fetchMock).not.toHaveBeenCalled()
})

it.each<[string, unknown, string[]]>([
	['invalid metadata', payload({ recipe: { ...metadata, title: ' ', ingredients: [{ name: 'Pasta', quantity: null, unit: 'g' }] } }), ['ingredients.0.quantity', 'title']],
	['a key that is not a UUID', payload({ idempotencyKey: 'not-a-uuid' }), ['idempotencyKey']],
	['a missing key', { recipe: metadata }, ['idempotencyKey']],
])('rejects %s locally with dotted field errors and never calls the API', async (_name, body, fields) => {
	const result = await saveRecipe(body)
	expect(result.status).toBe('invalid')
	expect(Object.keys((result as { fieldErrors: object }).fieldErrors).sort()).toEqual(fields)
	expect(fetchMock).not.toHaveBeenCalled()
})

it('maps 400 to invalid and passes the API field errors through', async () => {
	fetchMock.mockResolvedValue(json({ code: 'VALIDATION_FAILED', message: 'raw upstream text', fieldErrors: { title: ['Taken'], 'step-0': ['Bad image'] } }, 400))
	expect(await saveRecipe()).toEqual({ status: 'invalid', message: SAVE_MESSAGES.invalid, fieldErrors: { title: ['Taken'], 'step-0': ['Bad image'] } })
})

it.each<[string, Response, SaveRecipeResponse]>([
	['401', json({ code: 'UNAUTHORIZED', message: 'x' }, 401), { status: 'session-expired', message: SAVE_MESSAGES.sessionExpired }],
	['403', json({ code: 'ORIGIN_REJECTED', message: 'x' }, 403), { status: 'failed', message: SAVE_MESSAGES.unverified }],
	['409 in progress', json({ code: 'IDEMPOTENCY_IN_PROGRESS', message: 'x' }, 409), { status: 'unknown', message: SAVE_MESSAGES.unknown }],
	['409 conflict', json({ code: 'IDEMPOTENCY_CONFLICT', message: 'x' }, 409), { status: 'failed', message: SAVE_MESSAGES.failed }],
	['413', json({ code: 'PAYLOAD_TOO_LARGE', message: 'raw upstream text' }, 413), { status: 'invalid', message: SAVE_MESSAGES.invalid, fieldErrors: { recipe: ['The recipe is too large to save.'] } }],
	['415', json({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'raw upstream text' }, 415), { status: 'failed', message: SAVE_MESSAGES.failed }],
	['429', json({ code: 'RATE_LIMITED', message: 'x' }, 429), { status: 'failed', message: SAVE_MESSAGES.rateLimited }],
	['503', json({ code: 'UNAVAILABLE', message: 'x' }, 503), { status: 'failed', message: SAVE_MESSAGES.failed }],
	['504', json({ code: 'DEADLINE', message: 'x' }, 504), { status: 'unknown', message: SAVE_MESSAGES.unknown }],
	['500', json({ code: 'BOOM', message: 'x' }, 500), { status: 'unknown', message: SAVE_MESSAGES.unknown }],
	['502 page', new Response('<html>bad gateway</html>', { status: 502 }), { status: 'unknown', message: SAVE_MESSAGES.unknown }],
	['201 without an id', json({ nope: true }, 201), { status: 'unknown', message: SAVE_MESSAGES.unknown }],
	['200 that is not JSON', new Response('not json', { status: 200 }), { status: 'unknown', message: SAVE_MESSAGES.unknown }],
])('maps an API %s to the documented outcome', async (_name, response, expected) => {
	fetchMock.mockResolvedValueOnce(response)
	expect(await saveRecipe()).toEqual(expected)
})

it('treats network errors and timeouts as an unknown outcome', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await saveRecipe()).toEqual({ status: 'unknown', message: SAVE_MESSAGES.unknown })
	fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
	expect(await saveRecipe()).toEqual({ status: 'unknown', message: SAVE_MESSAGES.unknown })
})

it('fails without sending when the API origin is not configured', async () => {
	vi.stubEnv('RECIPE_API_URL', '')
	expect(await saveRecipe()).toEqual({ status: 'failed', message: SAVE_MESSAGES.failed })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('never leaks cookies, upstream bodies or stack traces in results', async () => {
	fetchMock.mockResolvedValue(json({ code: 'BOOM', message: 'SELECT * FROM secrets; better-auth.session_token=abc', stack: 'at db.ts:1' }, 500))
	const serialized = JSON.stringify(await saveRecipe())
	expect(serialized).not.toMatch(/SELECT|session_token|secret-value|db\.ts/)
})

it('rejects a stale session before reading or forwarding the body', async () => {
	session.result = 'anonymous'
	expect(await saveRecipe()).toEqual({ status: 'session-expired', message: SAVE_MESSAGES.sessionExpired })
	expect(lastStatus).toBe(401)
	expect(fetchMock).not.toHaveBeenCalled()
})

it('fails safely, without sending, when the session service is unavailable', async () => {
	session.result = 'error'
	expect(await saveRecipe()).toEqual({ status: 'failed', message: SAVE_MESSAGES.failed })
	expect(fetchMock).not.toHaveBeenCalled()
})
