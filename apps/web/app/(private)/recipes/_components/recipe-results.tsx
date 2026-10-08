'use client'

import type { RecipeCategory, RecipeFilters } from '@recipe-app/contracts/types'
import { RecipeControls } from './recipe-controls'
import { RecipeList } from './recipe-list'
import { RecipeRequestError } from './recipe-request-error'
import { useRecipePages } from '@/features/recipes/hooks/use-recipe-pages'

type RecipeResultsProps = {
	endpoint: string
	filters: RecipeFilters
	onCategory: (category: RecipeCategory | null) => void
	onSort: (sort: Pick<RecipeFilters, 'sortBy' | 'order'>) => void
}

export function RecipeResults({ endpoint, filters, onCategory, onSort }: RecipeResultsProps) {
	const { query, sentinel } = useRecipePages(endpoint, filters)
	const controls = <RecipeControls filters={filters} counts={query.data?.pages[0].counts} onCategory={onCategory} onSort={onSort} />
	const error = <RecipeRequestError error={query.error} laterPage={query.isFetchNextPageError} pending={query.isFetching} onRetry={() => {
		if (query.isFetchNextPageError) void query.fetchNextPage({ cancelRefetch: false })
		else void query.refetch()
	}} />
	if (!query.data) return <div className="space-y-4">{controls}{query.isPending ? <p role="status">Loading recipes...</p> : error}</div>
	const recipes = query.data.pages.flatMap((page) => page.data)
	const meta = query.data.pages[0].meta
	return <div className="space-y-4">
		{controls}
		<RecipeList recipes={recipes} />
		{error}
		<div ref={sentinel} className="flex min-h-12 items-center justify-center" aria-live="polite">
			{query.isFetchingNextPage ? <p role="status">Loading more recipes...</p> : <p className="text-sm text-muted-foreground">Showing {recipes.length} of {meta.total} recipes</p>}
		</div>
	</div>
}
