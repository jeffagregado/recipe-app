'use server'

import { authUserResponseSchema, updateDisplayNameSchema } from '@recipe-app/contracts/schemas'
import { refresh } from 'next/cache'
import { readErrorEnvelope, readWriteContext, sendWrite } from '@/features/recipes/api/write-request'
import { DISPLAY_NAME_MESSAGES, type UpdateDisplayNameResult } from './results'

const SAVE_TIMEOUT_MS = 20_000

const failed = (message: string = DISPLAY_NAME_MESSAGES.failed): UpdateDisplayNameResult => ({ status: 'failed', message })
const sessionExpired: UpdateDisplayNameResult = { status: 'session-expired', message: DISPLAY_NAME_MESSAGES.sessionExpired }
const invalid = (message: string = DISPLAY_NAME_MESSAGES.invalid): UpdateDisplayNameResult => ({ status: 'invalid', message })

/**
 * Renames the signed-in Account. The session read is never cached (`getSession` only dedupes within one render), so a
 * confirmed save refreshes the router and the sidebar renders the new name without a reload.
 */
export async function updateDisplayName(input: unknown): Promise<UpdateDisplayNameResult> {
	const parsed = updateDisplayNameSchema.safeParse(input)
	// Only a message about the name itself is shown on the field; a malformed request gets the general wording.
	if (!parsed.success) return invalid(parsed.error.issues.find((issue) => issue.path[0] === 'displayName')?.message)
	const read = await readWriteContext()
	if ('problem' in read) return read.problem === 'session-expired' ? sessionExpired : failed(DISPLAY_NAME_MESSAGES.unverified)

	const outcome = await sendWrite({
		context: read.context,
		request: { method: 'PUT', path: '/account/display-name', body: JSON.stringify(parsed.data), contentType: 'application/json', timeoutMs: SAVE_TIMEOUT_MS },
	})
	// Saving the same name again is harmless, so an unknown outcome is simply a failure the person can retry.
	if ('problem' in outcome) return failed()
	const { response } = outcome
	// The message comes from the shared schema, never from a database error; every other field is dropped.
	if (response.status === 400) return invalid((await readErrorEnvelope(response))?.fieldErrors?.displayName?.[0])
	if (response.status === 401) return sessionExpired
	if (response.status === 403) return failed(DISPLAY_NAME_MESSAGES.unverified)
	if (response.status === 429) return failed(DISPLAY_NAME_MESSAGES.rateLimited)
	if (response.status !== 200) return failed()

	let payload: unknown
	try { payload = await response.json() } catch { payload = null }
	const saved = authUserResponseSchema.safeParse(payload)
	refresh()
	// The save is confirmed even when its echo cannot be read; the name sent is the name stored.
	return { status: 'saved', displayName: saved.success ? saved.data.user.displayName : parsed.data.displayName }
}
