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

export async function authFetch(path: '/auth/session' | '/auth/signup' | '/auth/login' | '/auth/logout' | '/auth/resend-verification' | '/auth/verify-email' | '/auth/forgot-password' | '/auth/reset-password', init: RequestInit = {}) {
	try {
		return await fetch(`${getApiOrigin()}${path}`, { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000) })
	} catch (cause) {
		if (cause instanceof AuthServiceError) throw cause
		throw new AuthServiceError(`Authentication request ${path} failed or timed out.`, { cause })
	}
}
