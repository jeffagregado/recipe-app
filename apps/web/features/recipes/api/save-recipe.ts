import 'server-only'

import { createRecipeResultSchema } from '@recipe-app/contracts/schemas'
import type { ApiErrorEnvelope } from '@recipe-app/contracts/types'
import { z } from 'zod'
import { getSession } from '@/features/auth/queries'
import type { SaveMessages, SaveRecipeFieldErrors, SaveRecipeResponse, SaveRecipeResult } from '@/features/recipes/form/lib/save-recipe-result'
import { readErrorEnvelope, readWriteContext, sendWrite, type WriteContext } from './write-request'

const SAVE_TIMEOUT_MS = 40_000
const KEY_SCHEMA = z.uuid()

export const UNREADABLE: SaveRecipeFieldErrors = { recipe: ['The recipe details could not be read.'] }
export const TOO_LARGE: SaveRecipeFieldErrors = { recipe: ['The recipe is too large to save.'] }

/** What differs between creating a recipe and saving changes to one; everything else is shared. */
export type SaveConfig<Metadata> = {
	method: 'POST' | 'PATCH'
	path: string
	messages: SaveMessages
	metadataSchema: z.ZodType<Metadata>
	/** Message for a 404 (the recipe being updated is gone). Without it a 404 is an unexpected status. */
	notFound?: string
}

type Submission<Metadata> = { metadata: Metadata; key: string }

function resultsFor(messages: SaveMessages) {
	return {
		failed: (message: string = messages.failed): SaveRecipeResult => ({ status: 'failed', message }),
		unknown: (): SaveRecipeResult => ({ status: 'unknown', message: messages.unknown }),
		invalid: (fieldErrors: SaveRecipeFieldErrors): SaveRecipeResult => ({ status: 'invalid', message: messages.invalid, fieldErrors }),
		sessionExpired: (): SaveRecipeResult => ({ status: 'session-expired', message: messages.sessionExpired }),
	}
}

function addIssues(target: SaveRecipeFieldErrors, error: z.ZodError) {
	for (const issue of error.issues) (target[issue.path.join('.') || 'recipe'] ??= []).push(issue.message)
}

/** The browser sends exactly `{ recipe, idempotencyKey }`. */
function isSaveBody(body: unknown): body is { recipe?: unknown; idempotencyKey?: unknown } {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) return false
	return Object.keys(body).every((name) => name === 'recipe' || name === 'idempotencyKey')
}

/** Re-validates everything the browser sent; the API repeats these checks, but invalid input must never be forwarded. */
function readSubmission<Metadata>(body: unknown, config: SaveConfig<Metadata>): { submission: Submission<Metadata> } | { errors: SaveRecipeFieldErrors } {
	if (!isSaveBody(body)) return { errors: UNREADABLE }
	const errors: SaveRecipeFieldErrors = {}
	const metadata = config.metadataSchema.safeParse(body.recipe)
	if (!metadata.success) addIssues(errors, metadata.error)
	const key = KEY_SCHEMA.safeParse(body.idempotencyKey)
	if (!key.success) errors.idempotencyKey = ['The submission key is missing or invalid.']

	if (!metadata.success || !key.success) return { errors }
	return { submission: { metadata: metadata.data, key: key.data } }
}

function mapFailure(status: number, envelope: ApiErrorEnvelope | null, { messages, notFound }: Pick<SaveConfig<unknown>, 'messages' | 'notFound'>): SaveRecipeResult {
	const { failed, unknown, invalid, sessionExpired } = resultsFor(messages)
	const mappers: Record<number, () => SaveRecipeResult> = {
		400: () => invalid(envelope?.fieldErrors ?? {}),
		401: sessionExpired,
		403: () => failed(messages.unverified),
		404: () => (notFound ? { status: 'not-found', message: notFound } : unknown()),
		409: () => (envelope?.code === 'IDEMPOTENCY_CONFLICT' ? failed() : unknown()),
		413: () => invalid(TOO_LARGE),
		// This route always sends JSON, so a refused media type is a confirmed failure the user cannot fix.
		415: () => failed(),
		429: () => failed(messages.rateLimited),
		503: () => failed(),
	}
	return (mappers[status] ?? unknown)()
}

/** Resolves to the saved recipe id, or to the result the form should show. Never throws. */
async function send<Metadata>(submission: Submission<Metadata>, config: SaveConfig<Metadata>, context: WriteContext): Promise<string | SaveRecipeResult> {
	const { failed, unknown } = resultsFor(config.messages)
	const outcome = await sendWrite({
		context,
		request: {
			method: config.method, path: config.path, body: JSON.stringify(submission.metadata), contentType: 'application/json', idempotencyKey: submission.key, timeoutMs: SAVE_TIMEOUT_MS,
		},
	})
	// The request may have reached the API; the form keeps its key so Retry cannot save twice.
	if ('problem' in outcome) return outcome.problem === 'not-sent' ? failed() : unknown()

	const { response } = outcome
	if (response.status === 200 || response.status === 201) {
		let payload: unknown
		try { payload = await response.json() } catch { return unknown() }
		const saved = createRecipeResultSchema.safeParse(payload)
		return saved.success ? saved.data.id : unknown()
	}
	return mapFailure(response.status, await readErrorEnvelope(response), config)
}

/**
 * Who is saving: rejects a stale session and an unverifiable request before any body is read or forwarded.
 * The API still authorizes the write itself.
 */
export async function authorizeSave(messages: SaveMessages): Promise<{ context: WriteContext } | { result: SaveRecipeResult }> {
	const { failed, sessionExpired } = resultsFor(messages)
	let session: Awaited<ReturnType<typeof getSession>>
	try { session = await getSession() } catch { return { result: failed() } }
	if (session.status === 'anonymous') return { result: sessionExpired() }

	const read = await readWriteContext()
	if ('problem' in read) return { result: read.problem === 'unverified' ? failed(messages.unverified) : sessionExpired() }
	return { context: read.context }
}

/** Validates the browser's JSON body and forwards the metadata as JSON. Resolves with the saved id or the result the form should show. */
export async function submitRecipe<Metadata>(body: unknown, config: SaveConfig<Metadata>, context: WriteContext): Promise<SaveRecipeResponse> {
	const parsed = readSubmission(body, config)
	if ('errors' in parsed) return resultsFor(config.messages).invalid(parsed.errors)

	const outcome = await send(parsed.submission, config, context)
	return typeof outcome === 'string' ? { status: 'saved', id: outcome } : outcome
}
