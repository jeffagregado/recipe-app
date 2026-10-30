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

import { SAVE_MESSAGES, type SaveRecipeResponse } from '@/features/recipes/form/lib/save-recipe-result'
import { handleCreateRecipe } from './save-route'

let lastStatus = 0
/** Sends the payload the way the browser does: same-site Origin, the page's Host, and whatever the test put in the headers. */
async function saveRecipe(formData: FormData) {
	const headers = new Headers(next.headers)
	headers.set('host', 'localhost:3000')
	const response = await handleCreateRecipe(new Request('http://localhost:3000/api/recipes', { method: 'POST', headers, body: formData }))
	lastStatus = response.status
	expect(response.headers.get('cache-control')).toBe('private, no-store')
	return await response.json() as SaveRecipeResponse & { message?: string }
}

const KEY = '2c1d3c2e-8a9b-4f6a-9d1f-0a7f6a1b2c3d'
const fetchMock = vi.fn<typeof fetch>()
const metadata = {
	title: 'Pasta', description: null, categoryIds: ['category-dinner'], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
	ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
	instructions: [{ description: 'Boil', hasImage: true }, { description: 'Serve', hasImage: false }],
}
const image = (name: string, size = 4) => new File([new Uint8Array(size)], name, { type: 'image/png' })

function payload(overrides: { recipe?: unknown; key?: string | null; files?: Record<string, File> } = {}) {
	const data = new FormData()
	data.append('recipe', typeof overrides.recipe === 'string' ? overrides.recipe : JSON.stringify(overrides.recipe ?? metadata))
	if (overrides.key !== null) data.append('idempotencyKey', overrides.key ?? KEY)
	for (const [name, file] of Object.entries(overrides.files ?? { 'step-0': image('boil.png') })) data.append(name, file, file.name)
	return data
}
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

it('forwards multipart parts with only the session cookie, origin, key and client address, then answers with the saved id', async () => {
	fetchMock.mockResolvedValue(json({ id: 'recipe/1' }, 201))
	expect(await saveRecipe(payload({ files: { cover: image('cover.png'), 'step-0': image('boil.png') } }))).toEqual({ status: 'saved', id: 'recipe/1' })
	expect(lastStatus).toBe(200)
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/recipes')
	expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error' })
	expect(init?.signal).toBeInstanceOf(AbortSignal)
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'idempotency-key': KEY, 'x-forwarded-for': '203.0.113.9',
	})
	const body = init?.body as FormData
	expect([...body.keys()].sort()).toEqual(['cover', 'recipe', 'step-0'])
	expect(JSON.parse(body.get('recipe') as string)).toEqual(metadata)
})

it('sends the web proxy secret, without surrounding whitespace, on a recipe write and never back to the browser', async () => {
	vi.stubEnv('RECIPE_WEB_PROXY_SECRET', ` ${'w'.repeat(40)}
`)
	fetchMock.mockResolvedValue(json({ id: 'recipe/1' }, 201))
	expect(await saveRecipe(payload())).toEqual({ status: 'saved', id: 'recipe/1' })
	const [, init] = fetchMock.mock.calls[0]
	expect(new Headers(init?.headers).get('x-recipe-web-secret')).toBe('w'.repeat(40))
})

it('treats a 200 replay like a first save', async () => {
	fetchMock.mockResolvedValue(json({ id: 'r1' }, 200))
	expect(await saveRecipe(payload())).toEqual({ status: 'saved', id: 'r1' })
})

it('refuses a missing or null Origin without contacting the API', async () => {
	for (const origin of [undefined, 'null']) {
		next.headers = new Headers(origin ? { origin } : {})
		expect(await saveRecipe(payload())).toEqual({ status: 'failed', message: SAVE_MESSAGES.unverified })
		expect(lastStatus).toBe(403)
	}
	expect(fetchMock).not.toHaveBeenCalled()
})

it('refuses a request from another site with 403 before checking the session or reading the body', async () => {
	next.headers.set('origin', 'https://evil.example')
	expect(await saveRecipe(payload())).toEqual({ status: 'failed', message: SAVE_MESSAGES.unverified })
	expect(lastStatus).toBe(403)
	expect(fetchMock).not.toHaveBeenCalled()
})

it('answers 413 for a body declared larger than a recipe can be, without contacting the API', async () => {
	const headers = { origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(200 * 1024 * 1024) }
	const response = await handleCreateRecipe(new Request('http://localhost:3000/api/recipes', { method: 'POST', headers, body: 'x' }))
	expect(response.status).toBe(413)
	expect(await response.json()).toMatchObject({ status: 'invalid', fieldErrors: { recipe: [expect.any(String)] } })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('reports a body that is not multipart as invalid without contacting the API', async () => {
	const headers = { origin: 'http://localhost:3000', host: 'localhost:3000', 'content-type': 'application/json' }
	const response = await handleCreateRecipe(new Request('http://localhost:3000/api/recipes', { method: 'POST', headers, body: '{}' }))
	expect(await response.json()).toMatchObject({ status: 'invalid', fieldErrors: { recipe: [expect.any(String)] } })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('reports an expired session without calling the API when there is no session cookie', async () => {
	next.cookies.delete('better-auth.session_token')
	expect(await saveRecipe(payload())).toEqual({ status: 'session-expired', message: SAVE_MESSAGES.sessionExpired })
	expect(lastStatus).toBe(401)
	expect(fetchMock).not.toHaveBeenCalled()
})

it('rejects invalid metadata, keys and files locally with dotted field errors and never calls the API', async () => {
	const bad = { ...metadata, title: ' ', ingredients: [{ name: 'Pasta', quantity: null, unit: 'g' }] }
	const result = await saveRecipe(payload({ recipe: bad }))
	expect(result).toMatchObject({ status: 'invalid', fieldErrors: { title: [expect.any(String)], 'ingredients.0.quantity': [expect.any(String)] } })
	expect(await saveRecipe(payload({ recipe: '{not json' }))).toMatchObject({ status: 'invalid', fieldErrors: { recipe: [expect.any(String)] } })
	expect(await saveRecipe(payload({ key: 'not-a-uuid' }))).toMatchObject({ status: 'invalid', fieldErrors: { idempotencyKey: [expect.any(String)] } })
	expect(await saveRecipe(payload({ key: null }))).toMatchObject({ status: 'invalid', fieldErrors: { idempotencyKey: [expect.any(String)] } })
	expect(await saveRecipe(payload({ files: {} }))).toMatchObject({ status: 'invalid', fieldErrors: { 'step-0': [expect.any(String)] } })
	expect(await saveRecipe(payload({ files: { 'step-0': image('a.png'), 'step-1': image('b.png') } }))).toMatchObject({ status: 'invalid', fieldErrors: { 'step-1': [expect.any(String)] } })
	const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })
	expect(await saveRecipe(payload({ files: { 'step-0': svg } }))).toMatchObject({ status: 'invalid', fieldErrors: { 'step-0': ['logo.svg is not a JPG, PNG or WebP image.'] } })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('rejects a photo over 4 MB without contacting the API', async () => {
	const big = new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' })
	expect(await saveRecipe(payload({ files: { 'step-0': big } }))).toMatchObject({ status: 'invalid', fieldErrors: { 'step-0': ['huge.png is 4.1 MB. The limit is 4 MB.'] } })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('maps 400 to invalid and passes the API field errors through', async () => {
	fetchMock.mockResolvedValue(json({ code: 'VALIDATION_FAILED', message: 'raw upstream text', fieldErrors: { title: ['Taken'], 'step-0': ['Bad image'] } }, 400))
	expect(await saveRecipe(payload())).toEqual({ status: 'invalid', message: SAVE_MESSAGES.invalid, fieldErrors: { title: ['Taken'], 'step-0': ['Bad image'] } })
})

it('maps 413 and 415 to invalid file errors', async () => {
	fetchMock.mockResolvedValueOnce(json({ code: 'PAYLOAD_TOO_LARGE', message: 'x', fieldErrors: { 'step-0': ['Too big'] } }, 413))
	expect(await saveRecipe(payload())).toMatchObject({ status: 'invalid', fieldErrors: { 'step-0': ['Too big'] } })
	fetchMock.mockResolvedValueOnce(json({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'x' }, 415))
	expect(await saveRecipe(payload())).toMatchObject({ status: 'invalid', fieldErrors: { recipe: [expect.any(String)] } })
})

it('maps the remaining statuses to the documented outcomes', async () => {
	const cases: [Response, string, string?][] = [
		[json({ code: 'UNAUTHORIZED', message: 'x' }, 401), 'session-expired'],
		[json({ code: 'ORIGIN_REJECTED', message: 'x' }, 403), 'failed', SAVE_MESSAGES.unverified],
		[json({ code: 'IDEMPOTENCY_IN_PROGRESS', message: 'x' }, 409), 'unknown', SAVE_MESSAGES.unknown],
		[json({ code: 'IDEMPOTENCY_CONFLICT', message: 'x' }, 409), 'failed', SAVE_MESSAGES.failed],
		[json({ code: 'RATE_LIMITED', message: 'x' }, 429), 'failed', SAVE_MESSAGES.rateLimited],
		[json({ code: 'UNAVAILABLE', message: 'x' }, 503), 'failed', SAVE_MESSAGES.failed],
		[json({ code: 'DEADLINE', message: 'x' }, 504), 'unknown', SAVE_MESSAGES.unknown],
		[json({ code: 'BOOM', message: 'x' }, 500), 'unknown'],
		[new Response('<html>bad gateway</html>', { status: 502 }), 'unknown'],
		[json({ nope: true }, 201), 'unknown'],
		[new Response('not json', { status: 200 }), 'unknown'],
	]
	for (const [response, status, message] of cases) {
		fetchMock.mockResolvedValueOnce(response)
		const result = await saveRecipe(payload())
		expect(result.status).toBe(status)
		if (message) expect(result.message).toBe(message)
	}
})

it('treats network errors and timeouts as an unknown outcome', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('socket hang up'))
	expect(await saveRecipe(payload())).toEqual({ status: 'unknown', message: SAVE_MESSAGES.unknown })
	fetchMock.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
	expect(await saveRecipe(payload())).toEqual({ status: 'unknown', message: SAVE_MESSAGES.unknown })
})

it('fails without sending when the API origin is not configured', async () => {
	vi.stubEnv('RECIPE_API_URL', '')
	expect(await saveRecipe(payload())).toEqual({ status: 'failed', message: SAVE_MESSAGES.failed })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('never leaks cookies, upstream bodies or stack traces in results', async () => {
	fetchMock.mockResolvedValue(json({ code: 'BOOM', message: 'SELECT * FROM secrets; better-auth.session_token=abc', stack: 'at db.ts:1' }, 500))
	const serialized = JSON.stringify(await saveRecipe(payload()))
	expect(serialized).not.toMatch(/SELECT|session_token|secret-value|db\.ts/)
})

it('rejects a stale session before forwarding any photo bytes', async () => {
	session.result = 'anonymous'
	expect(await saveRecipe(payload())).toEqual({ status: 'session-expired', message: SAVE_MESSAGES.sessionExpired })
	expect(lastStatus).toBe(401)
	expect(fetchMock).not.toHaveBeenCalled()
})

it('fails safely, without sending, when the session service is unavailable', async () => {
	session.result = 'error'
	expect(await saveRecipe(payload())).toEqual({ status: 'failed', message: SAVE_MESSAGES.failed })
	expect(fetchMock).not.toHaveBeenCalled()
})
