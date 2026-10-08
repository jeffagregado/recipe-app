'use client'

import type { RecipeCategory, RecipeFilters } from '@recipe-app/contracts/types'
import type { RefObject } from 'react'
import { RecipeControls } from './recipe-controls'
import { RecipeList } from './recipe-list'
import { RecipeListSkeleton } from './recipe-list-skeleton'
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
	const controls = <RecipeControls filters={filters} counts={query.data?.pages[0].counts} loading={query.isLoading} onCategory={onCategory} onSort={onSort} />
	const error = <RecipeRequestError error={query.error} laterPage={query.isFetchNextPageError} pending={query.isFetching} onRetry={() => {
		if (query.isFetchNextPageError) void query.fetchNextPage({ cancelRefetch: false })
		else void query.refetch()
	}} />
	if (!query.data) return <div className="flex flex-col gap-4">{controls}{query.isPending ? <RecipeListSkeleton /> : error}</div>
	const recipes = query.data.pages.flatMap((page) => page.data)
	const meta = query.data.pages[0].meta
	return <div className="space-y-4">
		{controls}
		<RecipeList recipes={recipes} />
		{error}
		<RecipeProgress loaded={recipes.length} total={meta.total} fetching={query.isFetchingNextPage} sentinel={sentinel} />
	</div>
}

type RecipeProgressProps = {
	loaded: number
	total: number
	fetching: boolean
	sentinel: RefObject<HTMLDivElement | null>
}

function RecipeProgress({ loaded, total, fetching, sentinel }: RecipeProgressProps) {
	return <>
		{fetching && <RecipeListSkeleton count={Math.min(6, total - loaded)} label="Loading more recipes" />}
		<div ref={sentinel} className="flex min-h-12 items-center justify-center" aria-live="polite">
			{!fetching && <p className="text-sm text-muted-foreground">Showing {loaded} of {total} recipes</p>}
		</div>
	</>
}
