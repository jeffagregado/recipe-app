import 'server-only'

import { recipeDetailSchema } from '@recipe-app/contracts/schemas'
import type { RecipeDetail } from '@recipe-app/contracts/types'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { apiHeaders, getApiOrigin } from '@/features/auth/api'
import { requireSession } from '@/features/auth/queries'
import { sessionCookieHeader } from '@/features/auth/session-cookie'
import { isValidRecipeId } from '../lib/recipe-id'

const REQUEST_TIMEOUT_MS = 20_000

class RecipeDetailError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'RecipeDetailError'
	}
}

async function fetchRecipe(id: string, cookie: string): Promise<Response> {
	const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	try {
		return await fetch(`${getApiOrigin()}/recipes/${encodeURIComponent(id)}`, {
			cache: 'no-store',
			redirect: 'error',
			signal,
			headers: apiHeaders({ Cookie: cookie }),
		})
	} catch (cause) {
		if (signal.aborted) throw new RecipeDetailError(`GET /recipes/:id timed out after ${REQUEST_TIMEOUT_MS / 1_000} seconds. Check recipe API availability.`, { cause })
		if (cause instanceof TypeError || cause instanceof DOMException) throw new RecipeDetailError('GET /recipes/:id failed during transport. Check recipe API availability.', { cause })
		throw cause
	}
}

async function parseRecipe(response: Response): Promise<RecipeDetail> {
	let payload: unknown
	try { payload = await response.json() } catch (cause) { throw new RecipeDetailError('GET /recipes/:id returned invalid JSON. Check the recipe API response.', { cause }) }
	const result = recipeDetailSchema.safeParse(payload)
	if (!result.success) throw new RecipeDetailError('GET /recipes/:id returned invalid recipe data. Check the recipe API response.', { cause: result.error })
	return result.data
}

/** Uncached owner-scoped read; null means unknown or foreign (indistinguishable). */
export async function getRecipe(id: string): Promise<RecipeDetail | null> {
	if (!isValidRecipeId(id)) return null
	await requireSession()
	const response = await fetchRecipe(id, sessionCookieHeader(await cookies()))
	if (response.status === 401) redirect('/')
	if (response.status === 404) return null
	if (!response.ok) throw new RecipeDetailError(`GET /recipes/:id failed (${response.status}). Check the recipe API response.`)
	return parseRecipe(response)
}
