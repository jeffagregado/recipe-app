import 'server-only'

import { recipeSummarySchema } from '@recipe-app/contracts/schemas'
import type { RecipeSummary } from '@recipe-app/contracts/types'
import { cacheLife, cacheTag } from 'next/cache'

class RecipeApiError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'RecipeApiError'
	}
}

function getRecipesUrl(): string {
	const baseUrl = process.env.RECIPE_API_URL
	if (!baseUrl) {
		throw new RecipeApiError('RECIPE_API_URL is missing. Set the recipe API base URL in the web server environment, then restart it.')
	}

	let url: URL
	try {
		url = new URL(baseUrl)
	} catch (error) {
		if (!(error instanceof TypeError)) throw error
		throw new RecipeApiError('RECIPE_API_URL must be an absolute HTTP or HTTPS base URL.', { cause: error })
	}
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
		throw new RecipeApiError('RECIPE_API_URL must use HTTP or HTTPS without credentials, query parameters, or a fragment.')
	}
	url.pathname = `${url.pathname.replace(/\/$/, '')}/recipes`
	return url.href
}

export async function getRecipes(): Promise<RecipeSummary[]> {
	return getRecipeList(getRecipesUrl())
}

// Include the configured endpoint in the cache key; only validated data is returned.
async function getRecipeList(url: string): Promise<RecipeSummary[]> {
	'use cache'
	cacheLife({ stale: 30, revalidate: 60, expire: 300 })
	cacheTag('recipes')

	let payload: unknown
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
		if (!response.ok) {
			throw new RecipeApiError(`GET /recipes failed (${response.status} ${response.statusText}). Check the recipe API response.`)
		}
		payload = await response.json()
	} catch (error) {
		if (error instanceof SyntaxError) {
			throw new RecipeApiError('GET /recipes returned invalid JSON. Check the recipe API response.', { cause: error })
		}
		if (error instanceof DOMException && error.name === 'TimeoutError') {
			throw new RecipeApiError('GET /recipes timed out after 5 seconds. Check recipe API availability.', { cause: error })
		}
		if (error instanceof TypeError || error instanceof DOMException) {
			throw new RecipeApiError('GET /recipes failed during transport. Check RECIPE_API_URL and recipe API availability.', { cause: error })
		}
		throw error
	}
	const result = recipeSummarySchema.array().safeParse(payload)

	if (!result.success) {
		throw new RecipeApiError(`GET /recipes returned invalid recipe data. Check the API response against RecipeSummary: ${result.error.message}`, { cause: result.error })
	}

	return result.data
}
