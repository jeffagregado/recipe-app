/** One-time toast messages passed through a redirect as `?notice=<code>`; Server Actions and the client reader share these codes. */
export const NOTICE_PARAM = 'notice'

export const NOTICE_MESSAGES = {
	'recipe-saved': 'Recipe saved',
	'recipe-updated': 'Recipe updated',
	'recipe-deleted': 'Recipe deleted',
	'email-verified': 'Email verified. Log in to continue.',
	'password-reset': 'Password updated. Log in with your new password.',
	'google-sign-in-failed': 'Google sign-in did not complete. Try again.',
	'google-email-not-verified': 'Google has not verified this email address. Verify it with Google, or sign up with a password.',
	// Points at the reset, never at a verification link already in the inbox: whoever signed up with the address chose that
	// Account's password, and only a reset replaces it before a Google identity joins the Account.
	'google-account-not-verified': 'This email has an account that is not verified yet. Use "Forgot password?" to set a new password, which verifies it, then sign in with Google again.',
} as const

/** The notices that report a failure: they are announced urgently and stay until dismissed. */
const ERROR_NOTICES: ReadonlySet<string> = new Set<NoticeCode>(['google-sign-in-failed', 'google-email-not-verified', 'google-account-not-verified'])

export type NoticeCode = keyof typeof NOTICE_MESSAGES

/** Message for a known code; unknown codes (including prototype keys) return null. */
export function noticeMessage(code: string | null): string | null {
	return code !== null && Object.hasOwn(NOTICE_MESSAGES, code) ? NOTICE_MESSAGES[code as NoticeCode] : null
}

/** Whether a known code reports a failure rather than a success. */
export function noticeIsError(code: string | null): boolean {
	return code !== null && ERROR_NOTICES.has(code)
}

/** Builds a redirect target that shows the notice once on arrival. */
export function withNotice(path: `/${string}`, code: NoticeCode): string {
	return `${path}${path.includes('?') ? '&' : '?'}${NOTICE_PARAM}=${code}`
}

/** The current URL without the notice parameter; every other parameter and the hash are kept. */
export function urlWithoutNotice(pathname: string, searchParams: URLSearchParams, hash: string): string {
	const rest = new URLSearchParams(searchParams)
	rest.delete(NOTICE_PARAM)
	const query = rest.toString()
	return `${pathname}${query ? `?${query}` : ''}${hash}`
}
