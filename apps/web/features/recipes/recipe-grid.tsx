import type { RecipeFilters } from '@recipe-app/contracts/types'
import { io } from 'next/cache'
import type { SearchParams } from 'nuqs/server'
import { getRecipesUrl, hydrateRecipePage } from './api'
import { loadRecipeFilters, RecipeFilterError } from './filters'
import { RecipeBrowser } from './recipe-browser'
import { RecipeFilterErrorView } from './recipe-filter-error'
import { RecipeProvider } from './recipe-provider'

export async function RecipeGrid({ searchParams }: { searchParams: Promise<SearchParams> }) {
	await io()
	let filters: RecipeFilters
	try {
		filters = loadRecipeFilters(await searchParams)
	} catch (error) {
		if (!(error instanceof RecipeFilterError)) throw error
		return <RecipeFilterErrorView message={error.message} />
	}
	const endpoint = getRecipesUrl()
	const state = await hydrateRecipePage(endpoint, filters)
	return <RecipeProvider state={state}><RecipeBrowser endpoint={endpoint} /></RecipeProvider>
}
