import 'server-only'

import { createRecipeResultSchema } from '@recipe-app/contracts/schemas'
import { RECIPE_LIMITS, type ApiErrorEnvelope } from '@recipe-app/contracts/types'
import { z } from 'zod'
import { getSession } from '@/features/auth/queries'
import { demoSaveRefusal } from '@/features/demo/results'
import { checkRecipeImage } from '@/features/recipes/form/lib/recipe-files'
import type { SaveMessages, SaveRecipeFieldErrors, SaveRecipeResponse, SaveRecipeResult } from '@/features/recipes/form/lib/save-recipe-result'
import { readErrorEnvelope, readWriteContext, sendWrite, type WriteContext } from './write-request'

const UPLOAD_TIMEOUT_MS = 40_000
const KEY_SCHEMA = z.uuid()
const RESERVED_FIELDS = new Set(['recipe', 'idempotencyKey'])
const PHOTO_FIELD = /^(cover|step-\d{1,3})$/

/** What differs between creating a recipe and saving changes to one; everything else is shared. */
export type SaveConfig<Metadata> = {
	method: 'POST' | 'PATCH'
	path: string
	messages: SaveMessages
	metadataSchema: z.ZodType<Metadata>
	/** The photo parts the metadata declares: every one must be present and nothing else may be. */
	expectedFiles: (metadata: Metadata, files: Map<string, File>) => string[]
	/** Message for a 404 (the recipe being updated is gone). Without it a 404 is an unexpected status. */
	notFound?: string
}

type Submission<Metadata> = { metadata: Metadata; key: string; files: Map<string, File> }

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

function parseMetadata<Metadata>(raw: FormDataEntryValue | null, schema: z.ZodType<Metadata>, errors: SaveRecipeFieldErrors): Metadata | undefined {
	if (typeof raw !== 'string') return void (errors.recipe = ['The recipe details are missing.'])
	if (new TextEncoder().encode(raw).length > RECIPE_LIMITS.metadataBytes) return void (errors.recipe = ['The recipe details are too large.'])
	let json: unknown
	try { json = JSON.parse(raw) } catch { return void (errors.recipe = ['The recipe details could not be read.']) }
	const parsed = schema.safeParse(json)
	if (parsed.success) return parsed.data
	addIssues(errors, parsed.error)
}

type PartProblem = { field: string; message: string }

/** A non-reserved multipart part is either a single photo file or a problem to report. */
function classifyPart(name: string, value: FormDataEntryValue, seen: Map<string, File>): File | PartProblem {
	if (!PHOTO_FIELD.test(name)) return { field: 'recipe', message: 'The request contained an unexpected part.' }
	if (seen.has(name)) return { field: name, message: 'Send one photo per field.' }
	if (typeof value === 'string') return { field: name, message: 'Expected a photo file.' }
	return value
}

function collectFiles(formData: FormData, errors: SaveRecipeFieldErrors): Map<string, File> {
	const files = new Map<string, File>()
	for (const [name, value] of formData.entries()) {
		if (RESERVED_FIELDS.has(name)) continue
		const part = classifyPart(name, value, files)
		if (part instanceof File) files.set(name, part)
		else errors[part.field] = [part.message]
	}
	return files
}

function readKey(raw: FormDataEntryValue | null, errors: SaveRecipeFieldErrors): string | undefined {
	const key = KEY_SCHEMA.safeParse(raw)
	if (key.success) return key.data
	errors.idempotencyKey = ['The submission key is missing or invalid.']
}

/** File count and step indexes must match what the metadata declares. */
function checkAgainstMetadata<Metadata>(metadata: Metadata | undefined, config: SaveConfig<Metadata>, files: Map<string, File>, errors: SaveRecipeFieldErrors) {
	if (!metadata) return
	const expected = new Set(config.expectedFiles(metadata, files))
	for (const name of expected) if (!files.has(name)) errors[name] ??= ['This photo is missing.']
	for (const name of files.keys()) if (!expected.has(name)) errors[name] ??= ['This photo does not belong to a step.']
}

function checkPhotos(files: Map<string, File>, errors: SaveRecipeFieldErrors) {
	let total = 0
	for (const [name, file] of files) {
		total += file.size
		const problem = checkRecipeImage(file)
		if (problem) errors[name] = [problem]
	}
	if (total > RECIPE_LIMITS.requestBytes) errors.recipe = ['The photos are too large to save together.']
}

/** Re-validates everything the browser sent; the API repeats these checks, but invalid input must never be forwarded. */
function readSubmission<Metadata>(formData: FormData, config: SaveConfig<Metadata>): { submission: Submission<Metadata> } | { errors: SaveRecipeFieldErrors } {
	const errors: SaveRecipeFieldErrors = {}
	const metadata = parseMetadata(formData.get('recipe'), config.metadataSchema, errors)
	const key = readKey(formData.get('idempotencyKey'), errors)
	const files = collectFiles(formData, errors)
	checkAgainstMetadata(metadata, config, files, errors)
	checkPhotos(files, errors)

	if (Object.keys(errors).length > 0 || !metadata || !key) return { errors }
	return { submission: { metadata, key, files } }
}

function toUpstreamBody<Metadata>({ metadata, files }: Submission<Metadata>): FormData {
	const body = new FormData()
	body.append('recipe', JSON.stringify(metadata))
	for (const [name, file] of files) body.append(name, file, file.name)
	return body
}

function mapFailure(status: number, envelope: ApiErrorEnvelope | null, { messages, notFound }: Pick<SaveConfig<unknown>, 'messages' | 'notFound'>): SaveRecipeResult {
	const { failed, unknown, invalid, sessionExpired } = resultsFor(messages)
	const mappers: Record<number, () => SaveRecipeResult> = {
		400: () => invalid(envelope?.fieldErrors ?? {}),
		401: sessionExpired,
		403: () => failed(demoSaveRefusal(envelope?.code) ?? messages.unverified),
		404: () => (notFound ? { status: 'not-found', message: notFound } : unknown()),
		409: () => (envelope?.code === 'IDEMPOTENCY_CONFLICT' ? failed() : unknown()),
		413: () => invalid(envelope?.fieldErrors ?? { recipe: ['The recipe or its photos are too large to save.'] }),
		415: () => invalid(envelope?.fieldErrors ?? { recipe: ['One of the photos is not a supported image.'] }),
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
		request: { method: config.method, path: config.path, body: toUpstreamBody(submission), idempotencyKey: submission.key, timeoutMs: UPLOAD_TIMEOUT_MS },
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
 * Who is saving: rejects a stale session and an unverifiable request before any photo bytes are read or forwarded.
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

/** Validates the browser's FormData and forwards the multipart request. Resolves with the saved id or the result the form should show. */
export async function submitRecipe<Metadata>(formData: FormData, config: SaveConfig<Metadata>, context: WriteContext): Promise<SaveRecipeResponse> {
	const parsed = readSubmission(formData, config)
	if ('errors' in parsed) return resultsFor(config.messages).invalid(parsed.errors)

	const outcome = await send(parsed.submission, config, context)
	return typeof outcome === 'string' ? { status: 'saved', id: outcome } : outcome
}
