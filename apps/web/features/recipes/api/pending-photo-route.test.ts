// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { UPLOAD_MESSAGES, type PhotoUploadResult } from '@/features/recipes/form/lib/photo-upload-result'
import { handlePhotoDelete, handlePhotoUpload } from './pending-photo-route'

const PHOTO_ID = '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70'
const fetchMock = vi.fn<typeof fetch>()
const photo = (name = 'cover.webp', type = 'image/webp', size = 4) => new File([new Uint8Array(size)], name, { type })
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function form(parts: Record<string, File | string> = { photo: photo() }) {
	const data = new FormData()
	for (const [name, value] of Object.entries(parts)) data.append(name, value)
	return data
}

let lastStatus = 0
/** Uploads the way the browser does: same-site Origin, the page's Host, and whatever the test put in the headers. */
async function upload(body: FormData | string = form(), extra: Record<string, string> = {}) {
	const headers = new Headers(next.headers)
	headers.set('host', 'localhost:3000')
	for (const [name, value] of Object.entries(extra)) headers.set(name, value)
	const response = await handlePhotoUpload(new Request('http://localhost:3000/api/pending-photos', { method: 'POST', headers, body }))
	lastStatus = response.status
	expect(response.headers.get('cache-control')).toBe('private, no-store')
	return await response.json() as PhotoUploadResult
}

beforeEach(() => {
	session.result = 'authenticated'
	next.headers = new Headers({ origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9', cookie: 'analytics=1' })
	next.cookies = new Map([['better-auth.session_token', 'abc'], ['other-cookie', 'secret-value']])
	fetchMock.mockReset()
	vi.stubEnv('RECIPE_API_URL', 'http://api.example')
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('forwards the photo with only the session cookie, origin and client address, then answers with the Pending photo id', async () => {
	fetchMock.mockResolvedValue(json({ id: PHOTO_ID }, 201))
	expect(await upload()).toEqual({ status: 'uploaded', id: PHOTO_ID })
	expect(lastStatus).toBe(200)
	const [url, init] = fetchMock.mock.calls[0]
	expect(url).toBe('http://api.example/pending-photos')
	expect(init).toMatchObject({ method: 'POST', cache: 'no-store', redirect: 'error' })
	expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
		cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9',
	})
	const body = init?.body as FormData
	expect([...body.keys()]).toEqual(['photo'])
	expect((body.get('photo') as File).name).toBe('cover.webp')
})

it.each([
	['another site', { origin: 'https://evil.example' }],
	['no Origin', {}],
	['a null Origin', { origin: 'null' }],
])('refuses an upload from %s with 403 without contacting the API', async (_name, headers) => {
	next.headers = new Headers(headers)
	expect(await upload()).toEqual({ status: 'failed', message: UPLOAD_MESSAGES.unverified })
	expect(lastStatus).toBe(403)
	expect(fetchMock).not.toHaveBeenCalled()
})

it.each([
	['signed out', 'anonymous', 401, UPLOAD_MESSAGES.sessionExpired],
	['unreadable', 'error', 200, UPLOAD_MESSAGES.failed],
] as const)('answers a %s session without contacting the API', async (_name, result, status, message) => {
	session.result = result
	expect(await upload()).toEqual({ status: 'failed', message })
	expect(lastStatus).toBe(status)
	expect(fetchMock).not.toHaveBeenCalled()
})

it('answers 413 for a body declared larger than one photo, without contacting the API', async () => {
	const result = await upload('x', { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(5 * 1024 * 1024) })
	expect([lastStatus, result]).toEqual([413, { status: 'failed', message: UPLOAD_MESSAGES.tooLarge }])
	expect(fetchMock).not.toHaveBeenCalled()
})

it('rejects a file that is not a supported image locally, without contacting the API', async () => {
	expect(await upload(form({ photo: photo('logo.svg', 'image/svg+xml') }))).toEqual({ status: 'failed', message: 'logo.svg is not a JPG, PNG or WebP image.' })
	expect(fetchMock).not.toHaveBeenCalled()
})

const leaky = (status: number, code: string) => json({ code, message: 'internal detail from the API', fieldErrors: { photo: ['internal detail from the API'] } }, status)
it.each([
	['400', () => leaky(400, 'VALIDATION_FAILED'), 200, UPLOAD_MESSAGES.invalid],
	['401', () => leaky(401, 'UNAUTHENTICATED'), 401, UPLOAD_MESSAGES.sessionExpired],
	['403', () => leaky(403, 'ORIGIN_REJECTED'), 200, UPLOAD_MESSAGES.unverified],
	['413', () => leaky(413, 'PAYLOAD_TOO_LARGE'), 200, UPLOAD_MESSAGES.tooLarge],
	['415', () => leaky(415, 'UNSUPPORTED_MEDIA_TYPE'), 200, UPLOAD_MESSAGES.unsupported],
	['429', () => leaky(429, 'RATE_LIMITED'), 200, UPLOAD_MESSAGES.rateLimited],
	['409', () => leaky(409, 'PENDING_PHOTO_LIMIT'), 200, 'Too many photos are waiting to be saved. Save the recipe first, or try again tomorrow.'],
	['404', () => leaky(404, 'NOT_FOUND'), 200, UPLOAD_MESSAGES.failed],
	['503', () => leaky(503, 'SERVICE_UNAVAILABLE'), 200, UPLOAD_MESSAGES.failed],
	['a 201 without a Pending photo id', () => json({ id: 'not-a-uuid' }, 201), 200, UPLOAD_MESSAGES.failed],
	['a 201 that is not JSON', () => new Response('<html>', { status: 201 }), 200, UPLOAD_MESSAGES.failed],
] as const)('maps an API answer of %s to its own message and never passes on what the API said', async (_name, answer, status, message) => {
	fetchMock.mockResolvedValue(answer())
	expect(await upload()).toEqual({ status: 'failed', message })
	expect(lastStatus).toBe(status)
})

it('reports a network failure as a failed upload', async () => {
	fetchMock.mockRejectedValue(new TypeError('fetch failed'))
	expect(await upload()).toEqual({ status: 'failed', message: UPLOAD_MESSAGES.failed })
})

describe('deleting a Pending photo', () => {
	/** Deletes the way the browser does: same-site Origin, the page's Host, and whatever the test put in the headers. */
	async function remove(id = PHOTO_ID) {
		const headers = new Headers(next.headers)
		headers.set('host', 'localhost:3000')
		const response = await handlePhotoDelete(new Request(`http://localhost:3000/api/pending-photos/${id}`, { method: 'DELETE', headers }), id)
		expect(response.headers.get('cache-control')).toBe('private, no-store')
		return [response.status, await response.text()]
	}

	it('forwards the delete with only the session cookie, origin and client address, and answers 204', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
		expect(await remove()).toEqual([204, ''])
		const [url, init] = fetchMock.mock.calls[0]
		expect(url).toBe(`http://api.example/pending-photos/${PHOTO_ID}`)
		expect(init).toMatchObject({ method: 'DELETE', cache: 'no-store', redirect: 'error' })
		expect(init?.body).toBeUndefined()
		expect(Object.fromEntries(new Headers(init?.headers))).toEqual({
			cookie: 'better-auth.session_token=abc', origin: 'http://localhost:3000', 'x-forwarded-for': '203.0.113.9',
		})
	})

	it.each([
		['another site', { origin: 'https://evil.example' }],
		['no Origin', {}],
		['a null Origin', { origin: 'null' }],
	])('refuses a delete from %s with 403 without contacting the API', async (_name, headers) => {
		next.headers = new Headers(headers)
		expect(await remove()).toEqual([403, ''])
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it.each([
		['signed out', 'anonymous', 401],
		['unreadable', 'error', 503],
	] as const)('answers a %s session without contacting the API', async (_name, result, status) => {
		session.result = result
		expect(await remove()).toEqual([status, ''])
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('rejects an id that is not a Pending photo id locally, without contacting the API', async () => {
		expect(await remove('..%2Frecipes')).toEqual([400, ''])
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it.each([
		['401', () => leaky(401, 'UNAUTHENTICATED'), 401],
		['403', () => leaky(403, 'ORIGIN_REJECTED'), 502],
		['404', () => leaky(404, 'NOT_FOUND'), 502],
		['503', () => leaky(503, 'SERVICE_UNAVAILABLE'), 502],
		['a network failure', () => { throw new TypeError('fetch failed') }, 502],
	] as const)('maps an API answer of %s to its own status and never passes on what the API said', async (_name, answer, status) => {
		fetchMock.mockImplementation(async () => answer())
		expect(await remove()).toEqual([status, ''])
	})
})
