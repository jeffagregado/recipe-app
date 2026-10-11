import type { CategoryWithUsage } from '@recipe-app/contracts/types'

/**
 * - `saved`: the stored list, or null when the API confirmed the save but its answer could not be read.
 * - `invalid`: nothing was saved; field errors are keyed `<row index>.name`, or `categories` for the whole set.
 * - `stale`: nothing was saved; the list changed elsewhere since this page loaded.
 * - `session-expired` and `failed`: nothing was saved.
 */
export type SaveCategoriesResult =
	| { status: 'saved'; categories: CategoryWithUsage[] | null }
	| { status: 'invalid'; message: string; fieldErrors: Record<string, string[]> }
	| { status: 'stale'; message: string }
	| { status: 'session-expired'; message: string }
	| { status: 'failed'; message: string }

export const CATEGORY_MESSAGES = {
	saved: 'Categories saved',
	failed: 'Couldn’t save categories. Try again.',
	invalid: 'Check the highlighted categories and try again.',
	stale: 'Your categories changed in another tab. Reload.',
	sessionExpired: 'Your session has expired. Sign in again in another tab, then come back here and try again. Your changes are still here.',
	unverified: 'This request could not be verified. Refresh the page and try again.',
	rateLimited: 'Too many saves. Try again in a moment.',
} as const
