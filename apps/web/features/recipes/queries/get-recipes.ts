import 'server-only'

import type { RecipeFilters, RecipeListResponse } from '@recipe-app/contracts/types'
import { cacheLife, cacheTag } from 'next/cache'
import { dehydrate, QueryClient } from '@tanstack/react-query'
import { fetchRecipePage, RecipeApiError } from '../api/request'
import { recipeQueryOptions } from './recipe-query'

/** Only this validated, credential-free public endpoint is serialized to the browser. */
export function getRecipesUrl(): string {
	const baseUrl = process.env.RECIPE_API_URL
	if (!baseUrl) throw new RecipeApiError('RECIPE_API_URL is missing. Set the recipe API base URL in the web server environment, then restart it.')
	let url: URL
	try {
		url = new URL(baseUrl)
	} catch (cause) {
		if (!(cause instanceof TypeError)) throw cause
		throw new RecipeApiError('RECIPE_API_URL must be an absolute HTTP or HTTPS base URL.', { cause })
	}
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
		throw new RecipeApiError('RECIPE_API_URL must use HTTP or HTTPS without credentials, query parameters, or a fragment.')
	}
	url.pathname = `${url.pathname.replace(/\/$/, '')}/recipes`
	return url.href
}

// Endpoint and every filter participate in the first-page server cache key.
async function getRecipes(endpoint: string, filters: RecipeFilters): Promise<RecipeListResponse> {
	'use cache'
	cacheLife({ stale: 30, revalidate: 60, expire: 300 })
	cacheTag('recipes')
	return fetchRecipePage(endpoint, filters, 1)
}

/** Each request owns its server client; browser clients live in RecipeProvider. */
export async function hydrateRecipePage(endpoint: string, filters: RecipeFilters) {
	const client = new QueryClient()
	try {
		await client.fetchInfiniteQuery({ ...recipeQueryOptions(endpoint, filters), queryFn: () => getRecipes(endpoint, filters) })
		return dehydrate(client)
	} finally {
		client.clear()
	}
}
