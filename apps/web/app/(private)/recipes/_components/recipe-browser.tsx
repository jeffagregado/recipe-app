'use client'

import type { Category } from '@recipe-app/contracts/types'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useQueryStates } from 'nuqs'
import { readRecipeFilters, recipeParsers, recipeUrlOptions, RecipeFilterError } from '@/features/recipes/lib/filters'
import { RecipeFilterErrorView } from './recipe-filter-error'
import { RecipeResults } from './recipe-results'

type RecipeBrowserProps = { userId: string; endpoint: string; categories: Category[] }

export function RecipeBrowser({ userId, endpoint, categories }: RecipeBrowserProps) {
	const [, setFilters] = useQueryStates(recipeParsers, recipeUrlOptions)
	const params = useSearchParams()
	const loaded = readRecipeFilters(new URLSearchParams(params), categories)
	const ignoredCategory = !(loaded instanceof RecipeFilterError) && loaded.ignoredCategory
	// A category the list cannot use leaves the address bar without adding a history entry, so Back does not return to it.
	useEffect(() => {
		if (ignoredCategory) void setFilters({ category: null }, { history: 'replace' })
	}, [ignoredCategory, setFilters])
	if (loaded instanceof RecipeFilterError) return <RecipeFilterErrorView message={loaded.message} />
	const { filters } = loaded
	return <RecipeResults
		key={JSON.stringify(filters)}
		endpoint={endpoint}
		userId={userId}
		categories={categories}
		filters={filters}
		onFilter={({ category, favorites }) => { void setFilters({ category: category ?? null, favorites: favorites ? 'true' : null }) }}
		onSort={(sort) => { void setFilters(sort) }}
	/>
}
