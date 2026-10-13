'use server'

import { authErrorResponseSchema, googleStartResponseSchema } from '@recipe-app/contracts/schemas'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { GOOGLE_UNAVAILABLE, type AuthFailure } from './action-result'
import { authFetch } from './api'
import { applyGoogleStateCookies, countGoogleStateCookies } from './session-cookie'

const RATE_LIMITED: AuthFailure = { ok: false, code: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' }

/** The one server record of why the start failed: code and upstream status only. The browser gets one message. */
function logFailure(code: string, status?: number): AuthFailure {
	console.warn(`Auth: google-start failed with ${code}${status === undefined ? '' : ` (upstream ${status})`}.`)
	return code === 'RATE_LIMITED' ? RATE_LIMITED : GOOGLE_UNAVAILABLE
}

/**
 * Asks the API for the provider URL and sends the browser to Google. The API signs a state cookie for the flow; it is
 * copied onto the web origin here so the callback route can hand it back.
 */
export async function startGoogleSignIn(): Promise<AuthFailure> {
	const incoming = await headers()
	const origin = incoming.get('origin')
	if (!origin || origin === 'null') return logFailure('ORIGIN_REJECTED')
	const outgoing = new Headers({ 'Content-Type': 'application/json', Origin: origin })
	const address = incoming.get('x-forwarded-for')
	if (address) outgoing.set('X-Forwarded-For', address)
	let url: string
	try {
		const response = await authFetch('/auth/google/start', { method: 'POST', headers: outgoing, body: '{}' })
		const body: unknown = await response.json().catch(() => undefined)
		if (response.status !== 200) {
			const error = authErrorResponseSchema.safeParse(body)
			return logFailure(error.success ? error.data.code : 'SERVICE_UNAVAILABLE', response.status)
		}
		const parsed = googleStartResponseSchema.safeParse(body)
		// Exactly one state cookie belongs to one flow; anything else is not an answer to follow.
		if (!parsed.success || countGoogleStateCookies(response.headers) !== 1) return logFailure('SERVICE_UNAVAILABLE', response.status)
		applyGoogleStateCookies(response.headers, await cookies())
		url = parsed.data.url
	} catch {
		return logFailure('SERVICE_UNAVAILABLE')
	}
	redirect(url)
}
