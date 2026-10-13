'use server'

import { changePasswordSchema } from '@recipe-app/contracts/schemas'
import { readErrorEnvelope, readWriteContext, sendWrite } from '@/features/recipes/api/write-request'
import { PASSWORD_MESSAGES, type ChangePasswordResult, type PasswordFieldName } from './results'

const CHANGE_TIMEOUT_MS = 20_000
const FIELDS: readonly PasswordFieldName[] = ['currentPassword', 'newPassword']

const failed = (message: string = PASSWORD_MESSAGES.failed): ChangePasswordResult => ({ status: 'failed', message })
const sessionExpired: ChangePasswordResult = { status: 'session-expired', message: PASSWORD_MESSAGES.sessionExpired }

/** The first message about one of the two fields; a malformed request has none and gets the general wording. */
function invalid(message: (field: PasswordFieldName) => string | undefined): ChangePasswordResult {
	for (const field of FIELDS) {
		const found = message(field)
		if (found) return { status: 'invalid', field, message: found }
	}
	return failed(PASSWORD_MESSAGES.invalid)
}

/**
 * Changes the signed-in Account's password. The API signs every other session out and keeps this one as it is, so the
 * browser's cookie is untouched and nothing the page shows needs a refresh. Neither password is ever part of the result.
 */
export async function changePassword(input: unknown): Promise<ChangePasswordResult> {
	const parsed = changePasswordSchema.safeParse(input)
	if (!parsed.success) return invalid((field) => parsed.error.issues.find((issue) => issue.path[0] === field)?.message)
	const read = await readWriteContext()
	if ('problem' in read) return read.problem === 'session-expired' ? sessionExpired : failed(PASSWORD_MESSAGES.unverified)

	const outcome = await sendWrite({
		context: read.context,
		request: { method: 'PUT', path: '/account/password', body: JSON.stringify(parsed.data), contentType: 'application/json', timeoutMs: CHANGE_TIMEOUT_MS },
	})
	if ('problem' in outcome) return failed(outcome.problem === 'unknown' ? PASSWORD_MESSAGES.unknown : PASSWORD_MESSAGES.failed)
	const { response } = outcome
	if (response.status === 204) return { status: 'changed' }
	if (response.status === 400) {
		const envelope = await readErrorEnvelope(response)
		if (envelope?.code === 'INVALID_CURRENT_PASSWORD') return { status: 'invalid', field: 'currentPassword', message: PASSWORD_MESSAGES.wrongCurrent }
		// The messages come from the shared schema, never from a database error; every other field is dropped.
		return invalid((field) => envelope?.fieldErrors?.[field]?.[0])
	}
	if (response.status === 401) return sessionExpired
	if (response.status === 403) return failed(PASSWORD_MESSAGES.unverified)
	if (response.status === 429) return failed(PASSWORD_MESSAGES.rateLimited)
	return failed()
}
