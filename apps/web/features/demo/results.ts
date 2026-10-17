import type { DemoStartErrorCode } from '@recipe-app/contracts/types'

export type DemoStartFailure = { ok: false; code: DemoStartErrorCode; message: string }
export type ResetDemoResult = { ok: true } | DemoStartFailure

export const DEMO_START_MESSAGES: Record<DemoStartErrorCode, string> = {
	DEMO_BUSY: 'The demo is busy right now. Please try again in a few minutes.',
	RATE_LIMITED: 'You have started too many demos. Please try again in an hour.',
	ORIGIN_REJECTED: 'This request could not be verified. Refresh the page and try again.',
	SERVICE_UNAVAILABLE: 'The demo could not start. Please try again.',
}

/** The demo API's one recipe refusal the form can still meet: the photo controls that would cause the others are off. */
export function demoSaveRefusal(code: string | undefined): string | undefined {
	return code === 'DEMO_RECIPE_LIMIT' ? 'The demo holds up to 30 recipes. Delete one to add another.' : undefined
}
