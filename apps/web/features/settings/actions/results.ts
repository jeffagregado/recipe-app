/**
 * - `saved`: the stored name, trimmed as the shared schema trims it.
 * - `invalid`: nothing was saved; the message belongs on the display name field.
 * - `session-expired` and `failed`: nothing was saved.
 */
export type UpdateDisplayNameResult =
	| { status: 'saved'; displayName: string }
	| { status: 'invalid'; message: string }
	| { status: 'session-expired'; message: string }
	| { status: 'failed'; message: string }

/** Every Settings card says these two the same way. */
const SHARED_MESSAGES = {
	sessionExpired: 'Your session has expired. Sign in again in another tab, then come back here and try again.',
	unverified: 'This request could not be verified. Refresh the page and try again.',
} as const

export const DISPLAY_NAME_MESSAGES = {
	saved: 'Display name saved',
	failed: 'Couldn’t save your display name. Try again.',
	invalid: 'Check your display name and try again.',
	...SHARED_MESSAGES,
	rateLimited: 'Too many saves. Try again in a moment.',
} as const

export type PasswordField = 'currentPassword' | 'newPassword'

/**
 * - `changed`: the new password is stored, other devices are signed out and this one stays signed in.
 * - `invalid`: nothing changed; the message belongs on the named field.
 * - `session-expired`: nothing changed.
 * - `failed`: nothing changed, except after a lost connection, where the message says the outcome is unknown.
 */
export type ChangePasswordResult =
	| { status: 'changed' }
	| { status: 'invalid'; field: PasswordField; message: string }
	| { status: 'session-expired'; message: string }
	| { status: 'failed'; message: string }

export const PASSWORD_MESSAGES = {
	changed: 'Password changed',
	failed: 'Couldn’t change your password. Try again.',
	invalid: 'Check both passwords and try again.',
	wrongCurrent: 'Current password is incorrect.',
	...SHARED_MESSAGES,
	rateLimited: 'Too many attempts. Try again in a few minutes.',
	unknown: 'We couldn’t confirm the change. If your new password doesn’t work the next time you log in, use the old one.',
} as const

/** `sent`: the link is on its way to the Account's own address. Every other status sent nothing. */
export type RequestSetPasswordResult =
	| { status: 'sent' }
	| { status: 'session-expired'; message: string }
	| { status: 'failed'; message: string }

export const SET_PASSWORD_MESSAGES = {
	sent: 'Check your inbox. We sent a link to create your password. It expires in one hour.',
	sentToast: 'Link sent',
	failed: 'Couldn’t send the email. Try again.',
	alreadySet: 'This Account already has a password.',
	...SHARED_MESSAGES,
	rateLimited: 'You asked for too many emails. Try again in an hour.',
} as const
