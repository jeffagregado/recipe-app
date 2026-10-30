import 'server-only'

import { apiErrorEnvelopeSchema } from '@recipe-app/contracts/schemas'
import type { ApiErrorEnvelope } from '@recipe-app/contracts/types'
import { cookies, headers } from 'next/headers'
import { apiHeaders, getApiOrigin } from '@/features/auth/api'
import { sessionCookieHeader } from '@/features/auth/session-cookie'

/** What a write forwards to the API: the trusted origin and the session cookie, with the client IP read from `incoming`. */
export type WriteContext = { origin: string; cookie: string; incoming: Headers }

/** Reads the caller's context, or why no write may be attempted (nothing has been sent in either case). */
export async function readWriteContext(): Promise<{ context: WriteContext } | { problem: 'unverified' | 'session-expired' }> {
	const incoming = await headers()
	const origin = incoming.get('origin')
	if (!origin || origin === 'null') return { problem: 'unverified' }
	const cookie = sessionCookieHeader(await cookies())
	if (!cookie) return { problem: 'session-expired' }
	return { context: { origin, cookie, incoming } }
}

type WriteRequest = {
	method: 'PUT' | 'DELETE' | 'POST' | 'PATCH'
	path: string
	/** Multipart sets its own content type; a JSON string names it in `contentType`. */
	body?: FormData | string
	contentType?: 'application/json'
	idempotencyKey?: string
	timeoutMs: number
}

/**
 * `not-sent`: the API origin is not configured, so nothing left the server.
 * `unknown`: the request may have reached the API (network error or timeout).
 */
export type WriteOutcome = { response: Response } | { problem: 'not-sent' | 'unknown' }

/** Sends one authenticated write; never throws and never follows redirects or caches. */
export async function sendWrite({ context, request }: { context: WriteContext; request: WriteRequest }): Promise<WriteOutcome> {
	let apiOrigin: string
	try { apiOrigin = getApiOrigin() } catch { return { problem: 'not-sent' } }
	const outgoing = apiHeaders(context.incoming, { Cookie: context.cookie, Origin: context.origin })
	if (request.idempotencyKey) outgoing.set('Idempotency-Key', request.idempotencyKey)
	if (request.contentType) outgoing.set('Content-Type', request.contentType)
	try {
		const response = await fetch(`${apiOrigin}${request.path}`, {
			method: request.method, headers: outgoing, body: request.body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(request.timeoutMs),
		})
		return { response }
	} catch {
		return { problem: 'unknown' }
	}
}

export async function readErrorEnvelope(response: Response): Promise<ApiErrorEnvelope | null> {
	try {
		const parsed = apiErrorEnvelopeSchema.safeParse(await response.json())
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}
