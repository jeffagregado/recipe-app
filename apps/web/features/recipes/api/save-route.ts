import 'server-only'

import { createRecipeMetadataSchema, updateRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { RECIPE_LIMITS } from '@recipe-app/contracts/types'
import { SAVE_MESSAGES, UPDATE_MESSAGES, type SaveRecipeResponse } from '@/features/recipes/form/lib/save-recipe-result'
import { isValidRecipeId } from '@/features/recipes/lib/recipe-id'
import { isSameOrigin, readJson } from './request-body'
import { authorizeSave, submitRecipe, TOO_LARGE, UNREADABLE, type SaveConfig } from './save-recipe'

/** The metadata plus the wrapper and its submission key; anything larger is cut off while it is still arriving. */
const BODY_LIMIT_BYTES = RECIPE_LIMITS.metadataBytes + 1024

function respond(result: SaveRecipeResponse, status = 200): Response {
	return Response.json(result, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

/**
 * One recipe save: same-site check, then the session, and only then the JSON body. Outcomes the form handles (validation,
 * conflicts, an unknown result) answer 200 with a result; a missing session is 401, a cross-site request 403 and an
 * oversized body 413.
 */
async function handleSave<Metadata>(request: Request, config: SaveConfig<Metadata>): Promise<Response> {
	const { messages } = config
	if (!isSameOrigin(request)) return respond({ status: 'failed', message: messages.unverified }, 403)

	const authorized = await authorizeSave(messages)
	if ('result' in authorized) return respond(authorized.result, authorized.result.status === 'session-expired' ? 401 : 200)

	const body = await readJson(request, BODY_LIMIT_BYTES)
	if (body === 'too-large') return respond({ status: 'invalid', message: messages.invalid, fieldErrors: TOO_LARGE }, 413)
	if (body === 'unreadable') return respond({ status: 'invalid', message: messages.invalid, fieldErrors: UNREADABLE })

	return respond(await submitRecipe(body.json, config, authorized.context))
}

export function handleCreateRecipe(request: Request): Promise<Response> {
	return handleSave(request, { method: 'POST', path: '/recipes', messages: SAVE_MESSAGES, metadataSchema: createRecipeMetadataSchema })
}

/** A recipe that is gone (404) is reported on the form, so the user keeps what they typed. */
export async function handleUpdateRecipe(request: Request, recipeId: string): Promise<Response> {
	if (!isValidRecipeId(recipeId)) return respond({ status: 'not-found', message: UPDATE_MESSAGES.notFound })
	return handleSave(request, {
		method: 'PATCH',
		path: `/recipes/${encodeURIComponent(recipeId)}`,
		messages: UPDATE_MESSAGES,
		metadataSchema: updateRecipeMetadataSchema,
		notFound: UPDATE_MESSAGES.notFound,
	})
}
