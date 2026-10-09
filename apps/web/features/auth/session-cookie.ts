import { AuthServiceError } from './errors'

export const SESSION_COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'] as const
const MAX_AGE = 7 * 24 * 60 * 60
type CookieReader = { get: (name: string) => { value: string } | undefined }
type SessionCookieOptions = { httpOnly: true; sameSite: 'lax'; path: '/'; secure: boolean; maxAge: number }
type CookieWriter = { set: (name: string, value: string, options: SessionCookieOptions) => unknown }

/** Next decodes request cookies; encode them once for the upstream Cookie header. */
export function sessionCookieHeader(store: CookieReader): string {
	return SESSION_COOKIE_NAMES.flatMap((name) => {
		const value = store.get(name)?.value
		return value ? [`${name}=${encodeURIComponent(value)}`] : []
	}).join('; ')
}

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

function parseSessionCookie(header: string) {
	const [pair, ...attributes] = header.split(';')
	const equals = pair.indexOf('=')
	const name = pair.slice(0, equals).trim()
	if (!SESSION_COOKIE_NAMES.some((allowed) => name === allowed)) return null
	const options = new Map(attributes.map((attribute) => {
		const [key, ...value] = attribute.trim().split('=')
		return [key.toLowerCase(), value.join('=').trim()]
	}))
	const age = parseMaxAge(options.get('max-age'))
	const value = decodeCookieValue(pair.slice(equals + 1).trim())
	const expired = !value || age === 0
	return { name, value: expired ? '' : value, options: {
		httpOnly: true, sameSite: 'lax', path: '/', secure: name.startsWith('__Secure-') || options.has('secure'),
		maxAge: expired ? 0 : Math.min(age ?? MAX_AGE, MAX_AGE),
	} satisfies SessionCookieOptions }
}

/** Parse all allowed headers before writing; never split Set-Cookie on commas. */
export function applySessionCookies(headers: Headers, store: CookieWriter): number {
	const cookies = headers.getSetCookie().map(parseSessionCookie).filter((cookie) => cookie !== null)
	for (const cookie of cookies) store.set(cookie.name, cookie.value, cookie.options)
	return cookies.length
}

export function clearSessionCookies(store: CookieWriter) {
	for (const name of SESSION_COOKIE_NAMES) store.set(name, '', { httpOnly: true, sameSite: 'lax', path: '/', secure: name.startsWith('__Secure-'), maxAge: 0 })
}
