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
const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { UPDATE_MESSAGES } from '@/features/recipes/form/lib/save-recipe-result'
import { updateRecipe } from './actions'

const KEY = '2c1d3c2e-8a9b-4f6a-9d1f-0a7f6a1b2c3d'
const fetchMock = vi.fn<typeof fetch>()
const metadata = {
	title: 'Pasta', description: null, categories: ['Dinner'], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
	ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
	cover: 'keep',
	instructions: [{ id: 's1', description: 'Boil', image: 'keep' }, { id: null, description: 'Serve', image: 'replace' }],
}
const image = (name: string, size = 4) => new File([new Uint8Array(size)], name, { type: 'image/png' })

function payload(overrides: { recipe?: unknown; key?: string | null; files?: Record<string, File> } = {}) {
	const data = new FormData()
	data.append('recipe', typeof overrides.recipe === 'string' ? overrides.recipe : JSON.stringify(overrides.recipe ?? metadata))
	if (overrides.key !== null) data.append('idempotencyKey', overrides.key ?? KEY)
	for (const [name, file] of Object.entries(overrides.files ?? { 'step-1': image('serve.png') })) data.append(name, file, file.name)
	return data
}
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
	session.result = 'authenticated'
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	cache.refresh.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('PATCHes the recipe with only the session cookie, origin, key and client address, refreshes the client, then redirects with the updated notice', async () => {
	fetchMock.mockResolvedValue(json({ id: 'recipe/1' }, 200))
	await expect(updateRecipe('recipe/1', payload())).rejects.toThrow('NEXT_REDIRECT:/recipes/recipe%2F1?notice=recipe-updated')
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/recipes/recipe%2F1')
	expect(init).toMatchObject({ method: 'PATCH', cache: 'no-store', redirect: 'error' })
	expect(init?.signal).toBeInstanceOf(AbortSignal)
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'idempotency-key': KEY, 'x-forwarded-for': '203.0.113.9',
	})
	const body = init?.body as FormData
	expect([...body.keys()].sort()).toEqual(['recipe', 'step-1'])
	expect(JSON.parse(body.get('recipe') as string)).toEqual(metadata)
	expect(cache.refresh).toHaveBeenCalledOnce()
})

it('sends a cover and step photos only for slots marked replace, named by their final index', async () => {
	fetchMock.mockResolvedValue(json({ id: 'r1' }, 200))
	const recipe = { ...metadata, cover: 'replace' }
	await expect(updateRecipe('r1', payload({ recipe, files: { cover: image('cover.png'), 'step-1': image('serve.png') } }))).rejects.toThrow('NEXT_REDIRECT')
	expect([...(fetchMock.mock.calls[0][1]?.body as FormData).keys()].sort()).toEqual(['cover', 'recipe', 'step-1'])
})

it('rejects a photo for a kept slot, or a missing photo for a replaced one, without calling the API', async () => {
	expect(await updateRecipe('r1', payload({ files: { 'step-1': image('serve.png'), cover: image('cover.png') } }))).toMatchObject({
		status: 'invalid', fieldErrors: { cover: [expect.any(String)] },
	})
	expect(await updateRecipe('r1', payload({ files: {} }))).toMatchObject({ status: 'invalid', fieldErrors: { 'step-1': [expect.any(String)] } })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('rejects invalid update metadata, keys and files locally with dotted field errors', async () => {
	const duplicate = { ...metadata, instructions: [{ id: 's1', description: 'a', image: 'keep' }, { id: 's1', description: 'b', image: 'keep' }] }
	expect(await updateRecipe('r1', payload({ recipe: duplicate, files: {} }))).toMatchObject({ status: 'invalid', fieldErrors: { instructions: [expect.any(String)] } })
	const keptNew = { ...metadata, instructions: [{ id: null, description: 'a', image: 'keep' }] }
	expect(await updateRecipe('r1', payload({ recipe: keptNew, files: {} }))).toMatchObject({ status: 'invalid', fieldErrors: { 'instructions.0.image': [expect.any(String)] } })
	expect(await updateRecipe('r1', payload({ recipe: { ...metadata, title: ' ' } }))).toMatchObject({ status: 'invalid', fieldErrors: { title: [expect.any(String)] } })
	expect(await updateRecipe('r1', payload({ recipe: '{not json' }))).toMatchObject({ status: 'invalid', fieldErrors: { recipe: [expect.any(String)] } })
	expect(await updateRecipe('r1', payload({ key: 'not-a-uuid' }))).toMatchObject({ status: 'invalid', fieldErrors: { idempotencyKey: [expect.any(String)] } })
	const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })
	expect(await updateRecipe('r1', payload({ files: { 'step-1': svg } }))).toMatchObject({ status: 'invalid', fieldErrors: { 'step-1': ['logo.svg is not a JPG, PNG or WebP image.'] } })
	expect(fetchMock).not.toHaveBeenCalled()
})

it('reports a recipe that no longer exists (404) with its own result and does not redirect or refresh', async () => {
	fetchMock.mockResolvedValue(json({ code: 'NOT_FOUND', message: 'x' }, 404))
	expect(await updateRecipe('r1', payload())).toEqual({ status: 'not-found', message: UPDATE_MESSAGES.notFound })
	expect(cache.refresh).not.toHaveBeenCalled()
})

it('maps the remaining statuses exactly as create does, with update wording', async () => {
	const cases: [Response, string, string?][] = [
		[json({ code: 'VALIDATION_FAILED', message: 'x', fieldErrors: { 'instructions.0.image': ['Nope'] } }, 400), 'invalid', UPDATE_MESSAGES.invalid],
		[json({ code: 'UNAUTHORIZED', message: 'x' }, 401), 'session-expired', UPDATE_MESSAGES.sessionExpired],
		[json({ code: 'ORIGIN_REJECTED', message: 'x' }, 403), 'failed', UPDATE_MESSAGES.unverified],
		[json({ code: 'IDEMPOTENCY_IN_PROGRESS', message: 'x' }, 409), 'unknown', UPDATE_MESSAGES.unknown],
		[json({ code: 'IDEMPOTENCY_CONFLICT', message: 'x' }, 409), 'failed', UPDATE_MESSAGES.failed],
		[json({ code: 'PAYLOAD_TOO_LARGE', message: 'x', fieldErrors: { 'step-1': ['Too big'] } }, 413), 'invalid'],
		[json({ code: 'UNSUPPORTED_MEDIA_TYPE', message: 'x' }, 415), 'invalid'],
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
	expect(cache.refresh).not.toHaveBeenCalled()
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
