'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { readWriteContext, sendWrite } from '@/features/recipes/api/write-request'
import { isValidRecipeId } from '@/features/recipes/lib/recipe-id'
import { withNotice } from '@/lib/notice'
import type { DeleteResult } from './results'

const DELETE_TIMEOUT_MS = 20_000
const FAILED: DeleteResult = { ok: false, reason: 'failed' }

/** Deletes the recipe and its photos, then lands on the list with the "Recipe deleted" notice. Resolves only with a failure. */
export async function deleteRecipe(recipeId: string): Promise<DeleteResult> {
	if (!isValidRecipeId(recipeId)) return FAILED
	const read = await readWriteContext()
	if ('problem' in read) return read.problem === 'session-expired' ? { ok: false, reason: 'session-expired' } : FAILED

	const outcome = await sendWrite({
		context: read.context,
		request: { method: 'DELETE', path: `/recipes/${encodeURIComponent(recipeId)}`, timeoutMs: DELETE_TIMEOUT_MS },
	})
	if ('problem' in outcome) return FAILED
	const { status } = outcome.response
	if (status === 401) return { ok: false, reason: 'session-expired' }
	// 404 means it is already gone, which is what the user asked for.
	if (status !== 204 && status !== 404) return FAILED

	// Recipe reads are per request (no cache tag to update), but a revalidation makes the router drop preserved pages,
	// so Back or Forward cannot restore the deleted recipe or a list that still shows it.
	refresh()
	redirect(withNotice('/recipes', 'recipe-deleted'))
}
