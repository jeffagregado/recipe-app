import type { RecipeFilters } from '@recipe-app/contracts/types'
import { io } from 'next/cache'
import type { SearchParams } from 'nuqs/server'
import { RECIPE_BROWSER_ENDPOINT, hydrateRecipePage } from '@/features/recipes/queries/get-recipes'
import { requireSession } from '@/features/auth/queries'
import { loadRecipeFilters, RecipeFilterError } from '@/features/recipes/lib/filters'
import { RecipeBrowser } from './recipe-browser'
import { RecipeFilterErrorView } from './recipe-filter-error'
import { RecipeProvider } from './recipe-provider'

export async function RecipeGrid({ searchParams }: { searchParams: Promise<SearchParams> }) {
	await io()
	const { user } = await requireSession()
	let filters: RecipeFilters
	try {
		filters = loadRecipeFilters(await searchParams)
	} catch (error) {
		if (!(error instanceof RecipeFilterError)) throw error
		return <RecipeFilterErrorView message={error.message} />
	}
	const state = await hydrateRecipePage(filters)
	return <RecipeProvider key={user.id} state={state}><RecipeBrowser userId={user.id} endpoint={RECIPE_BROWSER_ENDPOINT} /></RecipeProvider>
}
