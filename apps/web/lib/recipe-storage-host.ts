// Storage host of the dev branch of the Neon recipe-app-v2 project.
const DEV_STORAGE_HOST = 'br-hidden-waterfall-b3dj0mm5.storage.c-4.ap-southeast-1.aws.neon.tech'

// Dot-separated DNS labels and nothing else, so no scheme, port, path, query, credentials or wildcard gets through.
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
const BARE_HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`)

/**
 * The one host the image optimizer may fetch recipe photos from. Every Neon branch has its own storage host, so a
 * worktree or CI run names its own in RECIPE_STORAGE_HOST; unset, it is the host of the dev branch.
 * Anything but a bare hostname would widen what the optimizer fetches, so it stops configuration loading.
 */
export function recipeStorageHost(value: string | undefined): string {
	const host = value?.trim().toLowerCase()
	if (!host) return DEV_STORAGE_HOST
	// The value is not repeated: a mistaken entry may be a signed URL.
	if (!BARE_HOSTNAME.test(host)) throw new Error('Invalid RECIPE_STORAGE_HOST: set a bare hostname, without a scheme, port, path or wildcard.')
	return host
}
