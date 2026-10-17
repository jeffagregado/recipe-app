'use server'

import { apiErrorEnvelopeSchema, demoStartResponseSchema } from '@recipe-app/contracts/schemas'
import type { DemoStartErrorCode } from '@recipe-app/contracts/types'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { logout } from '@/features/auth/actions'
import { apiHeaders, getApiOrigin } from '@/features/auth/api'
import { applySessionCookies, countSessionCookies } from '@/features/auth/session-cookie'

export type DemoStartFailure = { ok: false; code: DemoStartErrorCode; message: string }
export type ResetDemoResult = { ok: true } | DemoStartFailure

const MESSAGES: Record<DemoStartErrorCode, string> = {
	DEMO_BUSY: 'The demo is busy right now. Please try again in a few minutes.',
	RATE_LIMITED: 'You have started too many demos. Please try again in an hour.',
	ORIGIN_REJECTED: 'This request could not be verified. Refresh the page and try again.',
	SERVICE_UNAVAILABLE: 'The demo could not start. Please try again.',
}

/** Render's free plan can take about a minute to wake the API, and the start page says so while it waits. */
const START_TIMEOUT_MS = 90_000

/** The one server record of why a start failed: the code and upstream status only. */
function failure(code: DemoStartErrorCode, status?: number): DemoStartFailure {
	console.warn(`Demo: start failed with ${code}${status === undefined ? '' : ` (upstream ${status})`}.`)
	return { ok: false, code, message: MESSAGES[code] }
}

function failureCode(status: number, payload: unknown): DemoStartErrorCode {
	const code = apiErrorEnvelopeSchema.safeParse(payload).data?.code
	if (status === 503 && code === 'DEMO_BUSY') return 'DEMO_BUSY'
	if (status === 429) return 'RATE_LIMITED'
	if (status === 403) return 'ORIGIN_REJECTED'
	return 'SERVICE_UNAVAILABLE'
}

/** Creates a Demo account and returns the response that carries its session cookie, without writing any cookie yet. */
async function requestDemoStart(): Promise<{ ok: true; response: Response } | DemoStartFailure> {
	const incoming = await headers()
	const origin = incoming.get('origin')
	if (!origin || origin === 'null') return failure('ORIGIN_REJECTED')
	const outgoing = apiHeaders({ Origin: origin })
	const address = incoming.get('x-forwarded-for')
	if (address) outgoing.set('X-Forwarded-For', address)
	let response: Response
	try {
		response = await fetch(`${getApiOrigin()}/demo/start`, { method: 'POST', headers: outgoing, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(START_TIMEOUT_MS) })
	} catch {
		// Never replay a start with an unknown outcome: an account it created expires with no session on it.
		return failure('SERVICE_UNAVAILABLE')
	}
	if (response.status !== 201) return failure(failureCode(response.status, await response.json().catch(() => undefined)), response.status)
	const started = demoStartResponseSchema.safeParse(await response.json().catch(() => undefined))
	if (!started.success || countSessionCookies(response.headers) === 0) return failure('SERVICE_UNAVAILABLE', response.status)
	return { ok: true, response }
}

/** Start demo: a new Demo account, signed in, on the recipe list. */
export async function startDemo(): Promise<DemoStartFailure> {
	const started = await requestDemoStart()
	if (!started.ok) return started
	applySessionCookies(started.response.headers, await cookies())
	redirect('/recipes')
}

/**
 * Reset demo: a fresh Demo account in place of the current one, which is signed out and swept once it expires. The fresh
 * one starts first, so a busy or rate-limited demo leaves the visitor in the account they have.
 */
export async function resetDemo(): Promise<ResetDemoResult> {
	const started = await requestDemoStart()
	if (!started.ok) return started
	// A failed sign-out is not worth stopping for: the old account expires within a day either way.
	await logout()
	applySessionCookies(started.response.headers, await cookies())
	return { ok: true }
}
