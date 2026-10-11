'use server'

import { categoryListSchema, saveCategoriesSchema } from '@recipe-app/contracts/schemas'
import type { ApiErrorEnvelope } from '@recipe-app/contracts/types'
import { refresh } from 'next/cache'
import { readErrorEnvelope, readWriteContext, sendWrite } from '@/features/recipes/api/write-request'
import { CATEGORY_MESSAGES, type SaveCategoriesResult } from './results'

const SAVE_TIMEOUT_MS = 20_000
const ROW_NAME = /^\d{1,2}\.name$/
const ROW_ID = /^\d{1,2}\.id$/

const failed = (message: string = CATEGORY_MESSAGES.failed): SaveCategoriesResult => ({ status: 'failed', message })
const invalid = (fieldErrors: Record<string, string[]>): SaveCategoriesResult => ({ status: 'invalid', message: CATEGORY_MESSAGES.invalid, fieldErrors })

/** Only row-name and whole-set messages pass through; they come from the shared schema, never from a database error. */
function rejected(envelope: ApiErrorEnvelope | null): SaveCategoriesResult {
	const entries = Object.entries(envelope?.fieldErrors ?? {})
	// The API no longer knows a row's id: another tab or device changed the list after this page loaded.
	if (entries.some(([field]) => ROW_ID.test(field))) return { status: 'stale', message: CATEGORY_MESSAGES.stale }
	return invalid(Object.fromEntries(entries.filter(([field]) => ROW_NAME.test(field) || field === 'categories')))
}

/**
 * Replaces the signed-in user's whole category set. A confirmed save refreshes the router, so this page, the recipe form
 * and the recipe list all read the new names, ids and counts instead of a preserved copy.
 */
export async function saveCategories(input: unknown): Promise<SaveCategoriesResult> {
	const parsed = saveCategoriesSchema.safeParse(input)
	if (!parsed.success) {
		const fieldErrors: Record<string, string[]> = {}
		for (const issue of parsed.error.issues) (fieldErrors[issue.path.join('.') || 'categories'] ??= []).push(issue.message)
		return invalid(fieldErrors)
	}
	const read = await readWriteContext()
	if ('problem' in read) return read.problem === 'session-expired' ? { status: 'session-expired', message: CATEGORY_MESSAGES.sessionExpired } : failed(CATEGORY_MESSAGES.unverified)

	const outcome = await sendWrite({
		context: read.context,
		request: { method: 'PUT', path: '/categories', body: JSON.stringify(parsed.data), contentType: 'application/json', timeoutMs: SAVE_TIMEOUT_MS },
	})
	// Saving the same set again is harmless, so an unknown outcome is simply a failure the user can retry.
	if ('problem' in outcome) return failed()
	const { response } = outcome
	if (response.status === 400) return rejected(await readErrorEnvelope(response))
	if (response.status === 401) return { status: 'session-expired', message: CATEGORY_MESSAGES.sessionExpired }
	if (response.status === 403) return failed(CATEGORY_MESSAGES.unverified)
	if (response.status === 429) return failed(CATEGORY_MESSAGES.rateLimited)
	if (response.status !== 200) return failed()

	let payload: unknown
	try { payload = await response.json() } catch { payload = null }
	const saved = categoryListSchema.safeParse(payload)
	refresh()
	// The save is confirmed even when its echo cannot be read; the refreshed page shows the stored list either way.
	return { status: 'saved', categories: saved.success ? saved.data : null }
}
