import { openSavedRecipe } from '@/features/recipes/actions/open-saved-recipe'
import type { SavedNotice } from '@/features/recipes/actions/results'
import type { RecipeSaveBody } from './recipe-payload'
import type { SaveMessages, SaveRecipeResponse, SaveRecipeResult } from './save-recipe-result'

type SaveRequest = { url: string; method: 'POST' | 'PATCH'; notice: SavedNotice; messages: SaveMessages }

const STATUSES = new Set(['saved', 'invalid', 'session-expired', 'not-found', 'failed', 'unknown'])

/** Only trusts a body the save endpoint could have written; anything else means the outcome is unknown. */
function readResponse(body: unknown): SaveRecipeResponse | null {
	if (typeof body !== 'object' || body === null || !('status' in body) || typeof body.status !== 'string' || !STATUSES.has(body.status)) return null
	if (body.status === 'saved') return 'id' in body && typeof body.id === 'string' ? { status: 'saved', id: body.id } : null
	if (!('message' in body) || typeof body.message !== 'string') return null
	if (body.status === 'invalid' && (!('fieldErrors' in body) || typeof body.fieldErrors !== 'object' || body.fieldErrors === null)) return null
	return body as SaveRecipeResult
}

/**
 * Sends the form's body to the save endpoint as JSON with the session cookie. Resolves only with the result the form
 * should show: a confirmed save lands on the recipe page (a redirect, which rejects with Next's navigation error). A network
 * failure or an unreadable answer may still have saved, so it is reported as unknown and Retry reuses the submission key.
 */
export function recipeSaveRequest({ url, method, notice, messages }: SaveRequest): (body: RecipeSaveBody) => Promise<SaveRecipeResult> {
	return async (body) => {
		const unknown: SaveRecipeResult = { status: 'unknown', message: messages.unknown }
		let result: SaveRecipeResponse | null
		try {
			const response = await fetch(url, {
				method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin', cache: 'no-store', redirect: 'error',
			})
			result = readResponse(await response.json())
		} catch {
			return unknown
		}
		if (!result) return unknown
		if (result.status !== 'saved') return result
		await openSavedRecipe(result.id, notice)
		return unknown
	}
}
