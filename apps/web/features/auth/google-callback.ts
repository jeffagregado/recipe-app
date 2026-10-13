import 'server-only'

import { authErrorResponseSchema, googleCallbackResponseSchema, googleCallbackSchema } from '@recipe-app/contracts/schemas'
import type { GoogleCallbackInput } from '@recipe-app/contracts/types'
import { NextResponse, type NextRequest } from 'next/server'
import { withNotice } from '@/lib/notice'
import { authFetch } from './api'
import { applySessionCookies, clearGoogleStateCookies, countSessionCookies, googleStateCookieHeader, sessionCookieHeader } from './session-cookie'

type GoogleCallbackOutcome =
	| 'signed-in' | 'failed' | 'email-not-verified' | 'account-not-verified'
	| 'connected' | 'connect-failed' | 'already-linked' | 'connect-email-not-verified'

/** A sign-in ends in the app or back on the login page; a connect started from Settings ends there, whatever happened. */
const DESTINATIONS: Record<GoogleCallbackOutcome, string> = {
	'signed-in': '/recipes',
	failed: withNotice('/', 'google-sign-in-failed'),
	'email-not-verified': withNotice('/', 'google-email-not-verified'),
	'account-not-verified': withNotice('/', 'google-account-not-verified'),
	connected: withNotice('/settings', 'google-connected'),
	'connect-failed': withNotice('/settings', 'google-connect-failed'),
	'already-linked': withNotice('/settings', 'google-already-linked'),
	'connect-email-not-verified': withNotice('/settings', 'google-connect-email-not-verified'),
}

/** The API names the flow in its refusal: these codes are answered only to a sign-in or only to a connect. */
const REFUSALS: Record<string, GoogleCallbackOutcome> = {
	GOOGLE_EMAIL_NOT_VERIFIED: 'email-not-verified',
	// The Google address matches an Account whose own email is not Verified yet (ADR 0003): nothing was attached.
	EMAIL_NOT_VERIFIED: 'account-not-verified',
	GOOGLE_CONNECT_FAILED: 'connect-failed',
	GOOGLE_ALREADY_LINKED: 'already-linked',
	GOOGLE_CONNECT_EMAIL_NOT_VERIFIED: 'connect-email-not-verified',
}

/** The one server record of a failed callback: code and upstream status only, never the code or state Google sent. */
function logFailure(code: string, status?: number): GoogleCallbackOutcome {
	console.warn(`Auth: google-callback failed with ${code}${status === undefined ? '' : ` (upstream ${status})`}.`)
	return Object.hasOwn(REFUSALS, code) ? REFUSALS[code] : 'failed'
}

/**
 * Forwards the code and state with the state cookie, and with the session cookie when the browser has one: the API
 * attaches a connect only for the session that started it. Answers the API's response only when it is a sign-in to apply.
 */
async function complete(input: GoogleCallbackInput, cookie: string, address: string | null): Promise<Response | GoogleCallbackOutcome> {
	const headers = new Headers({ 'Content-Type': 'application/json', Cookie: cookie })
	if (address) headers.set('X-Forwarded-For', address)
	let response: Response
	try {
		response = await authFetch('/auth/google/callback', { method: 'POST', headers, body: JSON.stringify(input) })
	} catch {
		return logFailure('SERVICE_UNAVAILABLE')
	}
	if (response.status === 200) {
		// A connect: the identity joined the Account of the session already in the browser, so there is no cookie to copy.
		const connected = googleCallbackResponseSchema.safeParse(await response.json().catch(() => undefined))
		return connected.success ? 'connected' : logFailure('SERVICE_UNAVAILABLE', response.status)
	}
	if (response.status !== 204) {
		const error = authErrorResponseSchema.safeParse(await response.json().catch(() => undefined))
		return logFailure(error.success ? error.data.code : 'SERVICE_UNAVAILABLE', response.status)
	}
	try {
		if (countSessionCookies(response.headers) !== 1) return logFailure('SERVICE_UNAVAILABLE', response.status)
	} catch {
		return logFailure('SERVICE_UNAVAILABLE', response.status)
	}
	return response
}

/**
 * The landing Google redirects the browser to, on the web origin (ADR 0004), shared by sign-in and by the connect that
 * Settings starts. It forwards the callback to the API and redirects by what the API did: a sign-in copies the session
 * cookie the way the server actions do and enters the app, and a refused one goes back to the login page with a notice
 * and no session; a connect returns to Settings with a notice either way and sets no cookie. A cancelled consent carries
 * no code and is never forwarded. The state cookie is spent every time.
 */
export async function handleGoogleCallback(request: NextRequest): Promise<Response> {
	const query = request.nextUrl.searchParams
	const input = googleCallbackSchema.safeParse({ code: query.get('code') ?? undefined, state: query.get('state') ?? undefined })
	const stateCookie = googleStateCookieHeader(request.cookies)
	const result = input.success && stateCookie
		? await complete(input.data, [stateCookie, sessionCookieHeader(request.cookies)].filter(Boolean).join('; '), request.headers.get('x-forwarded-for'))
		: logFailure('GOOGLE_SIGN_IN_FAILED')
	// A relative Location: the browser resolves it against the address it asked for, so the redirect cannot change origin.
	// The callback URL holds the code, so it is neither cached nor sent on as a referrer.
	const response = new NextResponse(null, { status: 307, headers: {
		Location: DESTINATIONS[typeof result === 'string' ? result : 'signed-in'], 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
	} })
	if (typeof result !== 'string') applySessionCookies(result.headers, response.cookies)
	clearGoogleStateCookies(response.cookies)
	return response
}
