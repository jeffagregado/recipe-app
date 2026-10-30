import 'server-only'

import { AuthServiceError } from './errors'

/** Read at request time. Only configured HTTP(S) origin can receive credentials. */
export function getApiOrigin(): string {
	const configured = process.env.RECIPE_API_URL
	if (!configured) throw new AuthServiceError('RECIPE_API_URL is missing. Set the API origin in the web server environment.')
	let url: URL
	try { url = new URL(configured) } catch { throw new AuthServiceError('RECIPE_API_URL must be an absolute HTTP or HTTPS origin.') }
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
		throw new AuthServiceError('RECIPE_API_URL must be an HTTP or HTTPS origin without credentials, path, query or fragment.')
	}
	return url.origin
}

/**
 * Headers for a server-side API request, given the headers of the user's request to this web server. They carry the
 * secret that proves the request came from here and the user's IP, which the API trusts only next to the secret and only
 * when it is one IP address. Vercel overwrites X-Forwarded-For with the one address that connected, and locally Next
 * fills it from the socket; any other value, such as a list a proxy appended to, leaves the API on the connecting IP.
 * Server-only: the browser must never hold the secret.
 */
export function apiHeaders(incoming: Headers, init?: HeadersInit): Headers {
	const headers = new Headers(init)
	const secret = process.env.RECIPE_WEB_PROXY_SECRET
	if (secret) headers.set('X-Recipe-Web-Secret', secret)
	const clientIp = incoming.get('x-forwarded-for')?.trim()
	if (clientIp) headers.set('X-Recipe-Client-IP', clientIp)
	return headers
}

export async function authFetch(path: '/auth/session' | '/auth/signup' | '/auth/login' | '/auth/logout' | '/auth/resend-verification' | '/auth/verify-email' | '/auth/google/start' | '/auth/google/callback' | '/auth/forgot-password' | '/auth/reset-password' | '/account/email-change/confirm', incoming: Headers, init: RequestInit = {}) {
	try {
		return await fetch(`${getApiOrigin()}${path}`, { ...init, headers: apiHeaders(incoming, init.headers), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000) })
	} catch (cause) {
		if (cause instanceof AuthServiceError) throw cause
		throw new AuthServiceError(`Authentication request ${path} failed or timed out.`, { cause })
	}
}
