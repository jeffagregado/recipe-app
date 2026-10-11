import type { Category } from '@recipe-app/contracts/types'
import { io } from 'next/cache'
import type { SearchParams } from 'nuqs/server'
import { RECIPE_BROWSER_ENDPOINT, hydrateRecipePage } from '@/features/recipes/queries/get-recipes'
import { requireSession } from '@/features/auth/queries'
import { getCategories } from '@/features/categories/queries/get-categories'
import { loadRecipeFilters, RecipeFilterError, type LoadedRecipeFilters } from '@/features/recipes/lib/filters'
import { RecipeBrowser } from './recipe-browser'
import { RecipeFilterErrorView } from './recipe-filter-error'
import { RecipeProvider } from './recipe-provider'

export async function RecipeGrid({ searchParams }: { searchParams: Promise<SearchParams> }) {
	await io()
	const { user } = await requireSession()
	// Only id and name reach the browser; the chips take their counts from the list response.
	const categories: Category[] = (await getCategories()).map(({ id, name }) => ({ id, name }))
	let loaded: LoadedRecipeFilters
	try {
		loaded = loadRecipeFilters(await searchParams, categories)
	} catch (error) {
		if (!(error instanceof RecipeFilterError)) throw error
		return <RecipeFilterErrorView message={error.message} />
	}
	// The value itself is untrusted input and stays out of the log; the browser drops the parameter from the address bar.
	if (loaded.ignoredCategory) console.warn(`Recipes: ignored a category filter that is not one of user ${user.id}'s categories.`)
	const state = await hydrateRecipePage(loaded.filters)
	return <RecipeProvider key={user.id} state={state}><RecipeBrowser userId={user.id} endpoint={RECIPE_BROWSER_ENDPOINT} categories={categories} /></RecipeProvider>
}
