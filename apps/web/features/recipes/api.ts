import { recipeSummarySchema } from '@recipe-app/contracts/schemas'
import type { RecipeSummary } from '@recipe-app/contracts/types'

export async function getRecipes(signal: AbortSignal): Promise<RecipeSummary[]> {
	const response = await fetch('/api/recipes', { signal, cache: 'no-store' })

	if (!response.ok) {
		throw new Error(`GET /api/recipes failed (${response.status} ${response.statusText}). Retry or check the recipe API server.`)
	}

	const payload: unknown = await response.json()
	const result = recipeSummarySchema.array().safeParse(payload)

	if (!result.success) {
		throw new Error(`GET /api/recipes returned invalid recipe data. Check the API response against RecipeSummary: ${result.error.message}`, { cause: result.error })
	}

	return result.data
}
