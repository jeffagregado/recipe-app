export type SaveRecipeFieldErrors = Record<string, string[]>

/**
 * Outcome of a save that did not redirect.
 * - `invalid`: nothing was saved; field errors are keyed by dotted metadata path, `cover` or `step-<index>`.
 * - `session-expired`: nothing was saved; sign in elsewhere and try again.
 * - `failed`: confirmed failure; edit and resubmit with a NEW submission key.
 * - `unknown`: outcome unknown; Retry must reuse the same key and payload.
 */
export type SaveRecipeResult =
	| { status: 'invalid'; message: string; fieldErrors: SaveRecipeFieldErrors }
	| { status: 'session-expired'; message: string }
	| { status: 'failed'; message: string }
	| { status: 'unknown'; message: string }

export const SAVE_MESSAGES = {
	invalid: 'Check the highlighted fields and try again.',
	failed: 'Couldn’t save recipe. Try again.',
	unknown: 'We couldn’t confirm that the recipe was saved. Retry to save it safely, without creating a duplicate.',
	sessionExpired: 'Your session has expired. Sign in again in another tab, then come back here and try again. Your recipe is still here.',
	unverified: 'This request could not be verified. Refresh the page and try again.',
	rateLimited: 'Too many saves. Try again in a moment.',
} as const
