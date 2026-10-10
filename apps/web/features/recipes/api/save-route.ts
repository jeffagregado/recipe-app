import 'server-only'

import { createRecipeMetadataSchema, expectedRecipeFileFields, expectedRecipeUpdateFileFields, updateRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { RECIPE_LIMITS } from '@recipe-app/contracts/types'
import { SAVE_MESSAGES, UPDATE_MESSAGES, type SaveRecipeResponse } from '@/features/recipes/form/lib/save-recipe-result'
import { isValidRecipeId } from '@/features/recipes/lib/recipe-id'
import { authorizeSave, submitRecipe, type SaveConfig } from './save-recipe'

/** Photos plus metadata plus multipart framing; anything larger is cut off while it is still arriving. */
const BODY_LIMIT_BYTES = RECIPE_LIMITS.requestBytes + RECIPE_LIMITS.metadataBytes + 1024 * 1024

function respond(result: SaveRecipeResponse, status = 200): Response {
	return Response.json(result, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

/** Browsers send Origin on every POST and PATCH; it must name this site, so another site cannot save with the visitor's cookie. */
function isSameOrigin(request: Request): boolean {
	const origin = request.headers.get('origin')
	const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host')
	if (!origin || !host) return false
	try { return new URL(origin).host === host } catch { return false }
}

/** Reads the multipart body while counting bytes, so an oversized or undeclared-length upload is never buffered whole. */
async function readBody(request: Request): Promise<FormData | 'too-large' | 'unreadable'> {
	const type = request.headers.get('content-type') ?? ''
	if (!request.body || !type.toLowerCase().startsWith('multipart/form-data')) return 'unreadable'
	if (Number(request.headers.get('content-length')) > BODY_LIMIT_BYTES) return 'too-large'
	let received = 0
	let exceeded = false
	const counted = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
		transform(chunk, controller) {
			received += chunk.byteLength
			if (received <= BODY_LIMIT_BYTES) return controller.enqueue(chunk)
			exceeded = true
			controller.error(new Error('Recipe upload is too large.'))
		},
	}))
	try {
		return await new Response(counted, { headers: { 'Content-Type': type } }).formData()
	} catch {
		return exceeded ? 'too-large' : 'unreadable'
	}
}

/**
 * One recipe save: same-site check, then the session, and only then the body. Outcomes the form handles (validation,
 * conflicts, an unknown result) answer 200 with a result; a missing session is 401 and a cross-site request 403.
 */
async function handleSave<Metadata>(request: Request, config: SaveConfig<Metadata>): Promise<Response> {
	const { messages } = config
	if (!isSameOrigin(request)) return respond({ status: 'failed', message: messages.unverified }, 403)

	const authorized = await authorizeSave(messages)
	if ('result' in authorized) return respond(authorized.result, authorized.result.status === 'session-expired' ? 401 : 200)

	const body = await readBody(request)
	if (body === 'too-large') return respond({ status: 'invalid', message: messages.invalid, fieldErrors: { recipe: ['The recipe or its photos are too large to save.'] } }, 413)
	if (body === 'unreadable') return respond({ status: 'invalid', message: messages.invalid, fieldErrors: { recipe: ['The recipe details could not be read.'] } })

	return respond(await submitRecipe(body, config, authorized.context))
}

export function handleCreateRecipe(request: Request): Promise<Response> {
	return handleSave(request, {
		method: 'POST',
		path: '/recipes',
		messages: SAVE_MESSAGES,
		metadataSchema: createRecipeMetadataSchema,
		expectedFiles: (metadata, files) => expectedRecipeFileFields(metadata, files.has('cover')),
	})
}

/** A recipe that is gone (404) is reported on the form, so the user keeps what they typed. */
export async function handleUpdateRecipe(request: Request, recipeId: string): Promise<Response> {
	if (!isValidRecipeId(recipeId)) return respond({ status: 'not-found', message: UPDATE_MESSAGES.notFound })
	return handleSave(request, {
		method: 'PATCH',
		path: `/recipes/${encodeURIComponent(recipeId)}`,
		messages: UPDATE_MESSAGES,
		metadataSchema: updateRecipeMetadataSchema,
		expectedFiles: (metadata) => expectedRecipeUpdateFileFields(metadata),
		notFound: UPDATE_MESSAGES.notFound,
	})
}
