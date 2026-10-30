import { z } from 'zod'
import type { SaveMessages } from './save-recipe-result'

/** What the photo upload endpoint answers: the new Pending photo's id, or the message its slot shows next to Retry and Remove. */
export const photoUploadResultSchema = z.discriminatedUnion('status', [
	z.object({ status: z.literal('uploaded'), id: z.string() }),
	z.object({ status: z.literal('failed'), message: z.string() }),
])

export type PhotoUploadResult = z.infer<typeof photoUploadResultSchema>

/** Worded for one photo slot. `invalid` and `unknown` complete the save messages the shared session check expects. */
export const UPLOAD_MESSAGES = {
	failed: 'Couldn’t upload this photo. Try again.',
	invalid: 'This photo couldn’t be read. Choose another one.',
	unknown: 'Couldn’t upload this photo. Try again.',
	tooLarge: 'This photo is too large to upload. Choose a smaller one.',
	unsupported: 'This photo is not a JPG, PNG or WebP image.',
	sessionExpired: 'Your session has expired. Sign in again in another tab, then try again.',
	unverified: 'This request could not be verified. Refresh the page and try again.',
	rateLimited: 'Too many uploads. Try again in a moment.',
} as const satisfies SaveMessages & Record<string, string>
