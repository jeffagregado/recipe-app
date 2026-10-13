import { AuthServiceError } from './errors'

export const SESSION_COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'] as const
/** Signed by the API when a Google sign-in starts; the callback must bring it back to the web origin. */
const GOOGLE_STATE_COOKIE_NAMES = ['better-auth.state', '__Secure-better-auth.state'] as const
const SESSION_MAX_AGE = 7 * 24 * 60 * 60
const GOOGLE_STATE_MAX_AGE = 5 * 60
type CookieReader = { get: (name: string) => { value: string } | undefined }
type AuthCookieOptions = { httpOnly: true; sameSite: 'lax'; path: '/'; secure: boolean; maxAge: number }
type CookieWriter = { set: (name: string, value: string, options: AuthCookieOptions) => unknown }

function parseMaxAge(age: string | undefined): number | undefined {
	if (age === undefined) return undefined
	if (!/^\d+$/.test(age) || !Number.isSafeInteger(Number(age))) throw new AuthServiceError('Invalid session cookie expiry from authentication service.')
	return Number(age)
}

function decodeCookieValue(raw: string): string {
	let value: string
	try {
		value = decodeURIComponent(raw)
	} catch {
		throw new AuthServiceError('Invalid session cookie encoding from authentication service.')
	}
	if (/[\u0000-\u001f\u007f]/.test(value)) throw new AuthServiceError('Invalid session cookie value from authentication service.')
	return value
}

function parseAuthCookie(header: string, names: readonly string[], maxAge: number) {
	const [pair, ...attributes] = header.split(';')
	const equals = pair.indexOf('=')
	const name = pair.slice(0, equals).trim()
	if (!names.includes(name)) return null
	const options = new Map(attributes.map((attribute) => {
		const [key, ...value] = attribute.trim().split('=')
		return [key.toLowerCase(), value.join('=').trim()]
	}))
	const age = parseMaxAge(options.get('max-age'))
	const value = decodeCookieValue(pair.slice(equals + 1).trim())
	const expired = !value || age === 0
	return { name, value: expired ? '' : value, options: {
		httpOnly: true, sameSite: 'lax', path: '/', secure: name.startsWith('__Secure-') || options.has('secure'),
		maxAge: expired ? 0 : Math.min(age ?? maxAge, maxAge),
	} satisfies AuthCookieOptions }
}

/**
 * Moves one kind of API cookie between the API and the web origin: only the named cookies travel, and the browser
 * attributes are set here, never taken from the API's response.
 */
function cookieTransport(names: readonly string[], maxAge: number) {
	return {
		/** Next decodes request cookies; encode them once for the upstream Cookie header. */
		header: (store: CookieReader): string => names.flatMap((name) => {
			const value = store.get(name)?.value
			return value ? [`${name}=${encodeURIComponent(value)}`] : []
		}).join('; '),
		/** Parse all allowed headers before writing; never split Set-Cookie on commas. */
		apply: (headers: Headers, store: CookieWriter): number => {
			const cookies = headers.getSetCookie().map((header) => parseAuthCookie(header, names, maxAge)).filter((cookie) => cookie !== null)
			for (const cookie of cookies) store.set(cookie.name, cookie.value, cookie.options)
			return cookies.length
		},
		/** How many of the named cookies a response carries, without writing any. */
		count: (headers: Headers): number => headers.getSetCookie().filter((header) => parseAuthCookie(header, names, maxAge) !== null).length,
		clear: (store: CookieWriter) => {
			for (const name of names) store.set(name, '', { httpOnly: true, sameSite: 'lax', path: '/', secure: name.startsWith('__Secure-'), maxAge: 0 })
		},
	}
}

const session = cookieTransport(SESSION_COOKIE_NAMES, SESSION_MAX_AGE)
export const sessionCookieHeader = session.header
export const applySessionCookies = session.apply
export const countSessionCookies = session.count
export const clearSessionCookies = session.clear

const googleState = cookieTransport(GOOGLE_STATE_COOKIE_NAMES, GOOGLE_STATE_MAX_AGE)
export const googleStateCookieHeader = googleState.header
export const applyGoogleStateCookies = googleState.apply
export const countGoogleStateCookies = googleState.count
export const clearGoogleStateCookies = googleState.clear
