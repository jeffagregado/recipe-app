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

export const DISPLAY_NAME_MESSAGES = {
	saved: 'Display name saved',
	failed: 'Couldn’t save your display name. Try again.',
	invalid: 'Check your display name and try again.',
	sessionExpired: 'Your session has expired. Sign in again in another tab, then come back here and try again.',
	unverified: 'This request could not be verified. Refresh the page and try again.',
	rateLimited: 'Too many saves. Try again in a moment.',
} as const
