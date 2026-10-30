import { RECIPE_IMAGE_MIME_TYPES, RECIPE_LIMITS } from '@recipe-app/contracts/types'

const MIB = 1024 * 1024
/** Picked originals may be large phone photos; the browser shrinks them before uploading them. */
const PICKED_PHOTO_BYTES = 25 * MIB

export const IMAGE_ACCEPT = RECIPE_IMAGE_MIME_TYPES.join(',')
export const IMAGE_HINT = `JPG, PNG or WebP · up to ${PICKED_PHOTO_BYTES / MIB} MB`

export function formatFileSize(bytes: number): string {
	if (bytes < MIB) return `${Math.max(1, Math.round(bytes / 1024))} KB`
	return `${(bytes / MIB).toFixed(1)} MB`
}

function checkImage(file: File, limitBytes: number): string | null {
	if (!(RECIPE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return `${file.name} is not a JPG, PNG or WebP image.`
	if (file.size === 0) return `${file.name} is empty.`
	if (file.size > limitBytes) {
		// Round up so an oversized file is never reported as exactly the limit.
		const megabytes = Math.ceil((file.size / MIB) * 10) / 10
		return `${file.name} is ${megabytes.toFixed(1)} MB. The limit is ${limitBytes / MIB} MB.`
	}
	return null
}

/** Returns a user-facing problem, or null when a picked original can be shrunk into a recipe photo. */
export const checkPickedPhoto = (file: File): string | null => checkImage(file, PICKED_PHOTO_BYTES)

/** Returns a user-facing problem, or null when the (already shrunk) file can be uploaded as a recipe photo. */
export const checkRecipeImage = (file: File): string | null => checkImage(file, RECIPE_LIMITS.imageBytes)
