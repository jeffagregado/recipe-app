'use server'

import { readWriteContext, sendWrite } from '@/features/recipes/api/write-request'
import { isValidRecipeId } from '@/features/recipes/lib/recipe-id'
import type { FavoriteResult } from './results'

const FAVORITE_TIMEOUT_MS = 20_000
const FAILED: FavoriteResult = { ok: false, reason: 'failed' }

/** Saves or clears the signed-in user's favorite flag. The API call is idempotent, so retrying after a failure is safe. Never throws. */
export async function setFavorite(recipeId: string, favorite: boolean): Promise<FavoriteResult> {
	if (!isValidRecipeId(recipeId) || typeof favorite !== 'boolean') return FAILED
	const read = await readWriteContext()
	if ('problem' in read) return read.problem === 'session-expired' ? { ok: false, reason: 'session-expired' } : FAILED

	const outcome = await sendWrite({
		context: read.context,
		request: { method: favorite ? 'PUT' : 'DELETE', path: `/recipes/${encodeURIComponent(recipeId)}/favorite`, timeoutMs: FAVORITE_TIMEOUT_MS },
	})
	if ('problem' in outcome) return FAILED
	const { status } = outcome.response
	if (status === 204) return { ok: true }
	if (status === 401) return { ok: false, reason: 'session-expired' }
	if (status === 404) return { ok: false, reason: 'not-found' }
	return FAILED
}
