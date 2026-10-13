import { emailSchema } from '@recipe-app/contracts/schemas'

/**
 * The address a sign-up is waiting to verify, kept for /check-email. It travels in a cookie because an address in a URL
 * would land in access logs.
 */
export const PENDING_VERIFICATION_COOKIE = 'pending-verification-email'
const MAX_AGE = 60 * 60
type PendingCookieOptions = { httpOnly: true; sameSite: 'lax'; path: '/'; secure: boolean; maxAge: number }
type CookieWriter = { set: (name: string, value: string, options: PendingCookieOptions) => unknown }
type CookieReader = { get: (name: string) => { value: string } | undefined }

export function pendingVerificationCookie(secure: boolean, maxAge = MAX_AGE): PendingCookieOptions {
	return { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge }
}

export function rememberPendingVerification(store: CookieWriter, email: string, origin: string | null) {
	store.set(PENDING_VERIFICATION_COOKIE, email, pendingVerificationCookie(origin?.startsWith('https://') ?? false))
}

/** The stored address, or undefined when the cookie is absent or no longer holds a valid address. */
export function readPendingVerification(store: CookieReader): string | undefined {
	const parsed = emailSchema.safeParse(store.get(PENDING_VERIFICATION_COOKIE)?.value)
	return parsed.success ? parsed.data : undefined
}
