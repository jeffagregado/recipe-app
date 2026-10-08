'use client'

import { useSearchParams } from 'next/navigation'
import { useQueryStates } from 'nuqs'
import { recipeFilterError, recipeParsers, recipeUrlOptions } from '@/features/recipes/lib/filters'
import { RecipeFilterErrorView } from './recipe-filter-error'
import { RecipeResults } from './recipe-results'

export function RecipeBrowser({ endpoint }: { endpoint: string }) {
	const [state, setFilters] = useQueryStates(recipeParsers, recipeUrlOptions)
	const params = useSearchParams()
	const error = recipeFilterError(new URLSearchParams(params))
	if (error) return <RecipeFilterErrorView message={error.message} />
	const filters = { ...state, category: state.category ?? undefined }
	return <RecipeResults
		key={`${filters.category ?? 'All'}:${filters.sortBy}:${filters.order}`}
		endpoint={endpoint}
		filters={filters}
		onCategory={(category) => { void setFilters({ category }) }}
		onSort={(sort) => { void setFilters(sort) }}
	/>
}
