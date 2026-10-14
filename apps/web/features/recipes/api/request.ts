import { recipeListResponseSchema } from '@recipe-app/contracts/schemas'
import type { RecipeFilters, RecipeListResponse } from '@recipe-app/contracts/types'
import { SessionExpiredError } from '@/features/auth/errors'

export const RECIPE_PAGE_SIZE = 20
// Leave transport time beyond the API's 15-second request budget, including cold connections.
const REQUEST_TIMEOUT_MS = 20_000

class RecipeApiError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'RecipeApiError'
	}
}

function recipePageUrl(endpoint: string, filters: RecipeFilters, page: number): string {
	const url = new URL(endpoint, 'http://same-origin.invalid')
	url.searchParams.set('page', String(page))
	url.searchParams.set('limit', String(RECIPE_PAGE_SIZE))
	url.searchParams.set('sortBy', filters.sortBy)
	url.searchParams.set('order', filters.order)
	if (filters.category) url.searchParams.set('category', filters.category)
	if (filters.favorites) url.searchParams.set('favorites', 'true')
	if (filters.search) url.searchParams.set('search', filters.search)
	return endpoint.startsWith('/') ? `${url.pathname}${url.search}` : url.href
}

function isTransportError(cause: unknown): boolean {
	return cause instanceof TypeError || cause instanceof DOMException
}

function throwRequestError(cause: unknown, timeout: AbortSignal): never {
	if (cause instanceof SyntaxError) throw new RecipeApiError('GET /recipes returned invalid JSON. Check the recipe API response.', { cause })
	if (timeout.aborted) throw new RecipeApiError(`GET /recipes timed out after ${REQUEST_TIMEOUT_MS / 1_000} seconds. Check recipe API availability.`, { cause })
	if (isTransportError(cause)) throw new RecipeApiError('GET /recipes failed during transport. Check recipe API availability and allowed browser origin.', { cause })
	throw cause
}

function parseRecipePage(payload: unknown, page: number): RecipeListResponse {
	const result = recipeListResponseSchema.safeParse(payload)
	if (!result.success) throw new RecipeApiError(`GET /recipes returned invalid recipe list data: ${result.error.message}`, { cause: result.error })
	if (result.data.meta.page !== page || result.data.meta.limit !== RECIPE_PAGE_SIZE) throw new RecipeApiError('GET /recipes returned mismatched pagination. Check page and limit handling.')
	return result.data
}

async function readRecipePayload(url: string, signal: AbortSignal, headers?: HeadersInit): Promise<unknown> {
	const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', redirect: 'error', signal, headers })
	if (response.status === 401) throw new SessionExpiredError()
	if (!response.ok) throw new RecipeApiError(`GET /recipes failed (${response.status} ${response.statusText}). Check the recipe API response.`)
	return response.json()
}

export async function fetchRecipePage(endpoint: string, filters: RecipeFilters, page: number, signal?: AbortSignal, headers?: HeadersInit): Promise<RecipeListResponse> {
	const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	const combined = AbortSignal.any(signal ? [signal, timeout] : [timeout])
	let payload: unknown
	try {
		payload = await readRecipePayload(recipePageUrl(endpoint, filters, page), combined, headers)
	} catch (cause) {
		signal?.throwIfAborted()
		throwRequestError(cause, timeout)
	}
	return parseRecipePage(payload, page)
}
