'use server'

import { apiErrorEnvelopeSchema, createRecipeMetadataSchema, createRecipeResultSchema, expectedRecipeFileFields } from '@recipe-app/contracts/schemas'
import { RECIPE_LIMITS, type ApiErrorEnvelope, type CreateRecipeMetadata } from '@recipe-app/contracts/types'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getApiOrigin } from '@/features/auth/api'
import { getSession } from '@/features/auth/queries'
import { sessionCookieHeader } from '@/features/auth/session-cookie'
import { checkRecipeImage } from './_lib/recipe-files'
import { SAVE_MESSAGES, type SaveRecipeFieldErrors, type SaveRecipeResult } from './_lib/save-recipe-result'

const UPLOAD_TIMEOUT_MS = 40_000
const KEY_SCHEMA = z.uuid()
const RESERVED_FIELDS = new Set(['recipe', 'idempotencyKey'])
const PHOTO_FIELD = /^(cover|step-\d{1,3})$/

const failed = (message: string = SAVE_MESSAGES.failed): SaveRecipeResult => ({ status: 'failed', message })
const unknown = (): SaveRecipeResult => ({ status: 'unknown', message: SAVE_MESSAGES.unknown })
const invalid = (fieldErrors: SaveRecipeFieldErrors): SaveRecipeResult => ({ status: 'invalid', message: SAVE_MESSAGES.invalid, fieldErrors })

type Submission = { metadata: CreateRecipeMetadata; key: string; files: Map<string, File> }

function addIssues(target: SaveRecipeFieldErrors, error: z.ZodError) {
	for (const issue of error.issues) (target[issue.path.join('.') || 'recipe'] ??= []).push(issue.message)
}

function parseMetadata(raw: FormDataEntryValue | null, errors: SaveRecipeFieldErrors): CreateRecipeMetadata | undefined {
	if (typeof raw !== 'string') return void (errors.recipe = ['The recipe details are missing.'])
	if (new TextEncoder().encode(raw).length > RECIPE_LIMITS.metadataBytes) return void (errors.recipe = ['The recipe details are too large.'])
	let json: unknown
	try { json = JSON.parse(raw) } catch { return void (errors.recipe = ['The recipe details could not be read.']) }
	const parsed = createRecipeMetadataSchema.safeParse(json)
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

function flagMissingPhotos(expected: Set<string>, files: Map<string, File>, errors: SaveRecipeFieldErrors) {
	for (const name of expected) if (!files.has(name)) errors[name] ??= ['This photo is missing.']
}

function flagStrayPhotos(expected: Set<string>, files: Map<string, File>, errors: SaveRecipeFieldErrors) {
	for (const name of files.keys()) if (!expected.has(name)) errors[name] ??= ['This photo does not belong to a step.']
}

/** File count and step indexes must match what the metadata declares. */
function checkAgainstMetadata(metadata: CreateRecipeMetadata | undefined, files: Map<string, File>, errors: SaveRecipeFieldErrors) {
	if (!metadata) return
	const expected = new Set(expectedRecipeFileFields(metadata, files.has('cover')))
	flagMissingPhotos(expected, files, errors)
	flagStrayPhotos(expected, files, errors)
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
function readSubmission(formData: FormData): { submission: Submission } | { errors: SaveRecipeFieldErrors } {
	const errors: SaveRecipeFieldErrors = {}
	const metadata = parseMetadata(formData.get('recipe'), errors)
	const key = readKey(formData.get('idempotencyKey'), errors)
	const files = collectFiles(formData, errors)
	checkAgainstMetadata(metadata, files, errors)
	checkPhotos(files, errors)

	if (Object.keys(errors).length > 0 || !metadata || !key) return { errors }
	return { submission: { metadata, key, files } }
}

function toUpstreamBody({ metadata, files }: Submission): FormData {
	const body = new FormData()
	body.append('recipe', JSON.stringify(metadata))
	for (const [name, file] of files) body.append(name, file, file.name)
	return body
}

async function readEnvelope(response: Response): Promise<ApiErrorEnvelope | null> {
	try {
		const parsed = apiErrorEnvelopeSchema.safeParse(await response.json())
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

type FailureMapper = (envelope: ApiErrorEnvelope | null) => SaveRecipeResult

const FAILURES: Record<number, FailureMapper> = {
	400: (envelope) => invalid(envelope?.fieldErrors ?? {}),
	401: () => ({ status: 'session-expired', message: SAVE_MESSAGES.sessionExpired }),
	403: () => failed(SAVE_MESSAGES.unverified),
	409: (envelope) => (envelope?.code === 'IDEMPOTENCY_CONFLICT' ? failed() : unknown()),
	413: (envelope) => invalid(envelope?.fieldErrors ?? { recipe: ['The recipe or its photos are too large to save.'] }),
	415: (envelope) => invalid(envelope?.fieldErrors ?? { recipe: ['One of the photos is not a supported image.'] }),
	429: () => failed(SAVE_MESSAGES.rateLimited),
	503: () => failed(),
}

function mapFailure(status: number, envelope: ApiErrorEnvelope | null): SaveRecipeResult {
	return (FAILURES[status] ?? unknown)(envelope)
}

/** Resolves to the saved recipe id, or to the result the form should show. Never throws. */
async function send(submission: Submission, origin: string, cookie: string, address: string | null): Promise<string | SaveRecipeResult> {
	let apiOrigin: string
	try { apiOrigin = getApiOrigin() } catch { return failed() }
	const outgoing = new Headers({ Cookie: cookie, Origin: origin, 'Idempotency-Key': submission.key })
	if (address) outgoing.set('X-Forwarded-For', address)
	let response: Response
	try {
		response = await fetch(`${apiOrigin}/recipes`, {
			method: 'POST', headers: outgoing, body: toUpstreamBody(submission), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
		})
	} catch {
		// The request may have reached the API; the form keeps its key so Retry cannot create a duplicate.
		return unknown()
	}
	if (response.status === 200 || response.status === 201) {
		let payload: unknown
		try { payload = await response.json() } catch { return unknown() }
		const saved = createRecipeResultSchema.safeParse(payload)
		return saved.success ? saved.data.id : unknown()
	}
	return mapFailure(response.status, await readEnvelope(response))
}

export async function saveRecipe(formData: FormData): Promise<SaveRecipeResult> {
	// Reject a stale session before any photo bytes are forwarded; the API still authorizes the write itself.
	let session: Awaited<ReturnType<typeof getSession>>
	try { session = await getSession() } catch { return failed() }
	if (session.status === 'anonymous') return { status: 'session-expired', message: SAVE_MESSAGES.sessionExpired }

	const incoming = await headers()
	const origin = incoming.get('origin')
	if (!origin || origin === 'null') return failed(SAVE_MESSAGES.unverified)
	const cookie = sessionCookieHeader(await cookies())
	if (!cookie) return { status: 'session-expired', message: SAVE_MESSAGES.sessionExpired }

	const read = readSubmission(formData)
	if ('errors' in read) return invalid(read.errors)

	const outcome = await send(read.submission, origin, cookie, incoming.get('x-forwarded-for'))
	if (typeof outcome !== 'string') return outcome
	// The recipe list and detail are read per request (no 'use cache' or cacheTag), so there is no tag to update here.
	redirect(`/recipes/${encodeURIComponent(outcome)}?notice=recipe-saved`)
}
