'use client'

import { useSearchParams } from 'next/navigation'
import { useQueryStates } from 'nuqs'
import { loadRecipeFilters, recipeFilterError, recipeParsers, recipeUrlOptions } from '@/features/recipes/lib/filters'
import { RecipeFilterErrorView } from './recipe-filter-error'
import { RecipeResults } from './recipe-results'

export function RecipeBrowser({ userId, endpoint }: { userId: string; endpoint: string }) {
	const [, setFilters] = useQueryStates(recipeParsers, recipeUrlOptions)
	const params = useSearchParams()
	const error = recipeFilterError(new URLSearchParams(params))
	if (error) return <RecipeFilterErrorView message={error.message} />
	const filters = loadRecipeFilters(new URLSearchParams(params))
	return <RecipeResults
		key={JSON.stringify(filters)}
		endpoint={endpoint}
		userId={userId}
		filters={filters}
		onFilter={({ category, favorites }) => { void setFilters({ category: category ?? null, favorites: favorites ? 'true' : null }) }}
		onSort={(sort) => { void setFilters(sort) }}
	/>
}
