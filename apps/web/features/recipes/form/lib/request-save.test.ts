import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const action = vi.hoisted(() => ({ openSavedRecipe: vi.fn<(id: string, notice: string) => Promise<void>>() }))
vi.mock('@/features/recipes/actions/open-saved-recipe', () => action)

import type { RecipeSaveBody } from './recipe-payload'
import { recipeSaveRequest } from './request-save'
import { SAVE_MESSAGES } from './save-recipe-result'

const fetchMock = vi.fn<typeof fetch>()
const save = recipeSaveRequest({ url: '/api/recipes', method: 'POST', notice: 'recipe-saved', messages: SAVE_MESSAGES })
const UNKNOWN = { status: 'unknown', message: SAVE_MESSAGES.unknown }
const KEY = '11111111-1111-4111-8111-111111111111'
const saveBody = { recipe: { title: 'Pasta', cover: { pendingPhotoId: '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70' } }, idempotencyKey: KEY } as unknown as RecipeSaveBody

beforeEach(() => {
	fetchMock.mockReset()
	action.openSavedRecipe.mockReset()
	vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { vi.unstubAllGlobals() })

it('sends the body as JSON to the save endpoint with the session cookie and never follows redirects', async () => {
	fetchMock.mockResolvedValue(Response.json({ status: 'failed', message: 'x' }))
	await save(saveBody)
	expect(fetchMock).toHaveBeenCalledWith('/api/recipes', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
		body: `{"recipe":{"title":"Pasta","cover":{"pendingPhotoId":"0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70"}},"idempotencyKey":"${KEY}"}`,
	})
})

it('opens the saved recipe with its notice and lets the redirect through', async () => {
	fetchMock.mockResolvedValue(Response.json({ status: 'saved', id: 'recipe/1' }))
	action.openSavedRecipe.mockRejectedValue(new Error('NEXT_REDIRECT'))
	await expect(save(saveBody)).rejects.toThrow('NEXT_REDIRECT')
	expect(action.openSavedRecipe).toHaveBeenCalledWith('recipe/1', 'recipe-saved')
})

it('hands the form the result the endpoint answered, whatever the HTTP status', async () => {
	const results = [
		[{ status: 'invalid', message: 'Check', fieldErrors: { title: ['Required'] } }, 200],
		[{ status: 'session-expired', message: 'Sign in' }, 401],
		[{ status: 'failed', message: 'Unverified' }, 403],
		[{ status: 'not-found', message: 'Gone' }, 200],
		[{ status: 'unknown', message: 'Unsure' }, 200],
	] as const
	for (const [body, status] of results) {
		fetchMock.mockResolvedValueOnce(Response.json(body, { status }))
		expect(await save(saveBody)).toEqual(body)
	}
	expect(action.openSavedRecipe).not.toHaveBeenCalled()
})

it('reports an unknown outcome for a network failure or an answer it cannot trust', async () => {
	fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
	expect(await save(saveBody)).toEqual(UNKNOWN)
	const untrusted = [
		new Response('<html>Bad gateway</html>', { status: 502 }),
		Response.json({ status: 'saved' }),
		Response.json({ status: 'invalid', message: 'x' }),
		Response.json({ status: 'done', message: 'x' }),
		Response.json({ status: 'failed' }),
		Response.json(null),
	]
	for (const response of untrusted) {
		fetchMock.mockResolvedValueOnce(response)
		expect(await save(saveBody)).toEqual(UNKNOWN)
	}
	expect(action.openSavedRecipe).not.toHaveBeenCalled()
})
