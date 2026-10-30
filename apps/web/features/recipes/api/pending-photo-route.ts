import 'server-only'

import { pendingPhotoSchema } from '@recipe-app/contracts/schemas'
import { RECIPE_LIMITS } from '@recipe-app/contracts/types'
import { z } from 'zod'
import { checkRecipeImage } from '@/features/recipes/form/lib/recipe-files'
import { UPLOAD_MESSAGES, type PhotoUploadResult } from '@/features/recipes/form/lib/photo-upload-result'
import { isSameOrigin, readMultipart } from './multipart-request'
import { authorizeSave } from './save-recipe'
import { sendWrite, type WriteContext } from './write-request'

const UPLOAD_TIMEOUT_MS = 30_000
const DELETE_TIMEOUT_MS = 10_000

function respond(result: PhotoUploadResult, status = 200): Response {
	return Response.json(result, { status, headers: { 'Cache-Control': 'private, no-store' } })
}
const failed = (message: string = UPLOAD_MESSAGES.failed): PhotoUploadResult => ({ status: 'failed', message })

/** The one photo part, already shrunk by the browser, or the problem to show on its slot. Nothing invalid is forwarded. */
function readPhoto(body: FormData): File | string {
	const parts = [...body.entries()]
	const [name, value] = parts[0] ?? []
	if (parts.length !== 1 || name !== 'photo' || !(value instanceof File)) return UPLOAD_MESSAGES.invalid
	return checkRecipeImage(value) ?? value
}

/** Messages are this app's own: what the API said never reaches the browser. */
const STATUS_MESSAGES: Record<number, string> = {
	400: UPLOAD_MESSAGES.invalid, 401: UPLOAD_MESSAGES.sessionExpired, 403: UPLOAD_MESSAGES.unverified, 413: UPLOAD_MESSAGES.tooLarge,
	409: UPLOAD_MESSAGES.tooManyPending, 415: UPLOAD_MESSAGES.unsupported, 429: UPLOAD_MESSAGES.rateLimited,
}

async function forward(file: File, context: WriteContext): Promise<{ result: PhotoUploadResult; status?: number }> {
	const body = new FormData()
	body.append('photo', file, file.name)
	const outcome = await sendWrite({ context, request: { method: 'POST', path: '/pending-photos', body, timeoutMs: UPLOAD_TIMEOUT_MS } })
	if ('problem' in outcome) return { result: failed() }
	const { response } = outcome
	if (response.status !== 201) return { result: failed(STATUS_MESSAGES[response.status]), status: response.status === 401 ? 401 : undefined }
	let payload: unknown
	try { payload = await response.json() } catch { return { result: failed() } }
	const uploaded = pendingPhotoSchema.safeParse(payload)
	return { result: uploaded.success ? { status: 'uploaded', id: uploaded.data.id } : failed() }
}

/**
 * One photo upload: same-site check, then the session, and only then the body. A missing session is 401, a cross-site
 * request 403 and a body over one photo 413; every other outcome answers 200 with the result the slot shows.
 */
export async function handlePhotoUpload(request: Request): Promise<Response> {
	if (!isSameOrigin(request)) return respond(failed(UPLOAD_MESSAGES.unverified), 403)

	const authorized = await authorizeSave(UPLOAD_MESSAGES)
	if ('result' in authorized) return respond(failed(authorized.result.message), authorized.result.status === 'session-expired' ? 401 : 200)

	const body = await readMultipart(request, RECIPE_LIMITS.photoRequestBytes)
	if (body === 'too-large') return respond(failed(UPLOAD_MESSAGES.tooLarge), 413)
	if (body === 'unreadable') return respond(failed(UPLOAD_MESSAGES.invalid))
	const photo = readPhoto(body)
	if (typeof photo === 'string') return respond(failed(photo))

	const { result, status } = await forward(photo, authorized.context)
	return respond(result, status)
}

const answer = (status: number) => new Response(null, { status, headers: { 'Cache-Control': 'private, no-store' } })

/**
 * Deletes one of the caller's Pending photos; the form sends it without waiting for the answer, so no answer has a body.
 * 204 once the API has answered that the caller holds no such Pending photo any more, 401 when signed out, 403 for a
 * cross-site request, 400 for an id that is not a Pending photo id, and 502 or 503 when that could not be confirmed.
 */
export async function handlePhotoDelete(request: Request, id: string): Promise<Response> {
	if (!isSameOrigin(request)) return answer(403)

	const authorized = await authorizeSave(UPLOAD_MESSAGES)
	if ('result' in authorized) return answer(authorized.result.status === 'session-expired' ? 401 : 503)
	if (!z.uuid().safeParse(id).success) return answer(400)

	const outcome = await sendWrite({ context: authorized.context, request: { method: 'DELETE', path: `/pending-photos/${id}`, timeoutMs: DELETE_TIMEOUT_MS } })
	if ('problem' in outcome) return answer(502)
	return answer(outcome.response.status === 204 || outcome.response.status === 401 ? outcome.response.status : 502)
}
