import 'server-only'

import type { RecipeFilters } from '@recipe-app/contracts/types'
import { dehydrate, QueryClient } from '@tanstack/react-query'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { apiHeaders, getApiOrigin } from '@/features/auth/api'
import { requireSession } from '@/features/auth/queries'
import { sessionCookieHeader } from '@/features/auth/session-cookie'
import { SessionExpiredError } from '@/features/auth/errors'
import { fetchRecipePage } from '../api/request'
import { recipeQueryOptions } from './recipe-query'

export const RECIPE_BROWSER_ENDPOINT = '/backend/recipes'

/** Authorize every read; only the user ID and relative transport enter browser state. */
export async function hydrateRecipePage(filters: RecipeFilters) {
	const { user } = await requireSession()
	const cookie = sessionCookieHeader(await cookies())
	const incoming = await headers()
	const client = new QueryClient()
	try {
		await client.fetchInfiniteQuery({
			...recipeQueryOptions(user.id, RECIPE_BROWSER_ENDPOINT, filters),
			queryFn: () => fetchRecipePage(`${getApiOrigin()}/recipes`, filters, 1, undefined, apiHeaders(incoming, cookie ? { Cookie: cookie } : undefined)),
		})
		return dehydrate(client)
	} catch (error) {
		if (error instanceof SessionExpiredError) redirect('/auth/login')
		throw error
	} finally { client.clear() }
}
