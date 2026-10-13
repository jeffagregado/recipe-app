import 'server-only'

import { authErrorResponseSchema, googleCallbackSchema } from '@recipe-app/contracts/schemas'
import type { GoogleCallbackInput } from '@recipe-app/contracts/types'
import { NextResponse, type NextRequest } from 'next/server'
import { withNotice } from '@/lib/notice'
import { authFetch } from './api'
import { applySessionCookies, clearGoogleStateCookies, countSessionCookies, googleStateCookieHeader } from './session-cookie'

type GoogleCallbackOutcome = 'signed-in' | 'failed' | 'email-not-verified' | 'account-not-verified'

const DESTINATIONS: Record<GoogleCallbackOutcome, string> = {
	'signed-in': '/recipes',
	failed: withNotice('/', 'google-sign-in-failed'),
	'email-not-verified': withNotice('/', 'google-email-not-verified'),
	'account-not-verified': withNotice('/', 'google-account-not-verified'),
}

/** The one server record of a failed callback: code and upstream status only, never the code or state Google sent. */
function logFailure(code: string, status?: number): GoogleCallbackOutcome {
	console.warn(`Auth: google-callback failed with ${code}${status === undefined ? '' : ` (upstream ${status})`}.`)
	if (code === 'GOOGLE_EMAIL_NOT_VERIFIED') return 'email-not-verified'
	// The Google address matches an Account whose own email is not Verified yet (ADR 0003): nothing was attached.
	return code === 'EMAIL_NOT_VERIFIED' ? 'account-not-verified' : 'failed'
}

/** Forwards the code and state with the state cookie. Answers the API's response only when it is a sign-in to apply. */
async function completeSignIn(input: GoogleCallbackInput, stateCookie: string, address: string | null): Promise<Response | GoogleCallbackOutcome> {
	const headers = new Headers({ 'Content-Type': 'application/json', Cookie: stateCookie })
	if (address) headers.set('X-Forwarded-For', address)
	let response: Response
	try {
		response = await authFetch('/auth/google/callback', { method: 'POST', headers, body: JSON.stringify(input) })
	} catch {
		return logFailure('SERVICE_UNAVAILABLE')
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
 * The landing Google redirects the browser to, on the web origin (ADR 0004). It forwards the callback to the API, copies
 * the resulting session cookie the way the server actions do, and redirects into the app. A cancelled consent carries no
 * code, so it and every refusal go back to the login page with a notice and no session. The state cookie is spent either way.
 */
export async function handleGoogleCallback(request: NextRequest): Promise<Response> {
	const query = request.nextUrl.searchParams
	const input = googleCallbackSchema.safeParse({ code: query.get('code') ?? undefined, state: query.get('state') ?? undefined })
	const stateCookie = googleStateCookieHeader(request.cookies)
	const result = input.success && stateCookie
		? await completeSignIn(input.data, stateCookie, request.headers.get('x-forwarded-for'))
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
