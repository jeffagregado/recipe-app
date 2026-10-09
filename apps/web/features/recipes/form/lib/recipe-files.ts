import { RECIPE_IMAGE_MIME_TYPES, RECIPE_LIMITS } from '@recipe-app/contracts/types'

const MIB = 1024 * 1024

export const IMAGE_ACCEPT = RECIPE_IMAGE_MIME_TYPES.join(',')
export const IMAGE_HINT = 'JPG, PNG or WebP · up to 5 MB'

export function formatFileSize(bytes: number): string {
	if (bytes < MIB) return `${Math.max(1, Math.round(bytes / 1024))} KB`
	return `${(bytes / MIB).toFixed(1)} MB`
}

/** Returns a user-facing problem, or null when the file can be uploaded as a recipe photo. */
export function checkRecipeImage(file: File): string | null {
	if (!(RECIPE_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return `${file.name} is not a JPG, PNG or WebP image.`
	if (file.size === 0) return `${file.name} is empty.`
	if (file.size > RECIPE_LIMITS.imageBytes) {
		// Round up so an oversized file is never reported as exactly the limit.
		const megabytes = Math.ceil((file.size / MIB) * 10) / 10
		return `${file.name} is ${megabytes.toFixed(1)} MB. The limit is ${RECIPE_LIMITS.imageBytes / MIB} MB.`
	}
	return null
}
