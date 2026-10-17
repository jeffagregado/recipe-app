import type { DemoStartErrorCode } from '@recipe-app/contracts/types'

export type DemoStartFailure = { ok: false; code: DemoStartErrorCode; message: string }
export type ResetDemoResult = { ok: true } | DemoStartFailure

export const DEMO_START_MESSAGES: Record<DemoStartErrorCode, string> = {
	DEMO_BUSY: 'The demo is busy right now. Please try again in a few minutes.',
	RATE_LIMITED: 'You have started too many demos. Please try again in an hour.',
	ORIGIN_REJECTED: 'This request could not be verified. Refresh the page and try again.',
	SERVICE_UNAVAILABLE: 'The demo could not start. Please try again.',
}

/** Shown where a photo would be picked: the demo API refuses uploads and photo removal. */
export const PHOTO_UPLOADS_OFF = 'Photo uploads are off in the demo'

/**
 * What a recipe save refused by the demo API says, in place of the generic 403 message, which asks for a refresh that
 * cannot help. The form turns off the photo controls, so only the recipe limit is expected; the photo refusals cover a
 * page that predates the switch.
 */
const SAVE_REFUSALS = new Map<string | undefined, string>([
	['DEMO_RECIPE_LIMIT', 'The demo holds up to 30 recipes. Delete one to add another.'],
	['DEMO_UPLOADS_DISABLED', PHOTO_UPLOADS_OFF],
	['DEMO_PHOTO_REMOVAL_DISABLED', 'Photos can’t be removed in the demo'],
])

export const demoSaveRefusal = (code: string | undefined): string | undefined => SAVE_REFUSALS.get(code)
