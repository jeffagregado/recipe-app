'use server'

import { changeEmailSchema } from '@recipe-app/contracts/schemas'
import { refresh } from 'next/cache'
import { readErrorEnvelope, readWriteContext, sendWrite } from '@/features/recipes/api/write-request'
import { EMAIL_MESSAGES, type ChangeEmailResult, type EmailFieldName } from './results'

const SEND_TIMEOUT_MS = 20_000
const FIELDS: readonly EmailFieldName[] = ['newEmail', 'currentPassword']

const failed = (message: string = EMAIL_MESSAGES.failed): ChangeEmailResult => ({ status: 'failed', message })
const sessionExpired: ChangeEmailResult = { status: 'session-expired', message: EMAIL_MESSAGES.sessionExpired }
/** The statuses that mean the same whatever their body says. */
const STATUS_RESULTS: Partial<Record<number, ChangeEmailResult>> = { 401: sessionExpired, 403: failed(EMAIL_MESSAGES.unverified), 429: failed(EMAIL_MESSAGES.rateLimited) }

/** The first message about one of the two fields; a malformed request has none and gets the general wording. */
function invalid(message: (field: EmailFieldName) => string | undefined): ChangeEmailResult {
	for (const field of FIELDS) {
		const found = message(field)
		if (found) return { status: 'invalid', field, message: found }
	}
	return failed(EMAIL_MESSAGES.invalid)
}

/** Reads a 400 or 409 by its code. The wording is always this module's own; the API's messages are dropped. */
async function refusal(response: Response): Promise<ChangeEmailResult> {
	const envelope = await readErrorEnvelope(response)
	if (envelope?.code === 'INVALID_CURRENT_PASSWORD') return { status: 'invalid', field: 'currentPassword', message: EMAIL_MESSAGES.wrongCurrent }
	if (envelope?.code === 'EMAIL_ALREADY_EXISTS') return { status: 'invalid', field: 'newEmail', message: EMAIL_MESSAGES.taken }
	if (envelope?.code === 'PASSWORD_REQUIRED') {
		// The page is out of date: the Account has no password. The refreshed card shows the reason in place of the form.
		refresh()
		return failed(EMAIL_MESSAGES.passwordRequired)
	}
	if (response.status === 409) return failed()
	// The messages come from the shared schema, never from a database error; every other field is dropped.
	return invalid((field) => envelope?.fieldErrors?.[field]?.[0])
}

/**
 * Asks the API to mail a verification link to a new address for the signed-in Account. The Account's email is unchanged
 * until that link is confirmed; the refreshed session read carries the pending address the card's banner shows. Neither
 * the password nor the API's own wording is ever part of the result.
 */
export async function changeEmail(input: unknown): Promise<ChangeEmailResult> {
	const parsed = changeEmailSchema.safeParse(input)
	if (!parsed.success) return invalid((field) => parsed.error.issues.find((issue) => issue.path[0] === field)?.message)
	const read = await readWriteContext()
	if ('problem' in read) return read.problem === 'session-expired' ? sessionExpired : failed(EMAIL_MESSAGES.unverified)

	const outcome = await sendWrite({
		context: read.context,
		request: { method: 'POST', path: '/account/email-change', body: JSON.stringify(parsed.data), contentType: 'application/json', timeoutMs: SEND_TIMEOUT_MS },
	})
	if ('problem' in outcome) {
		// The request may have reached the API: the refreshed card shows the banner if the change was recorded.
		if (outcome.problem === 'unknown') refresh()
		return failed()
	}
	const { response } = outcome
	if (response.status === 200) {
		refresh()
		return { status: 'sent' }
	}
	if (response.status === 400 || response.status === 409) return refusal(response)
	return STATUS_RESULTS[response.status] ?? failed()
}
