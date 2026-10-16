'use client'

import type { Category, RecipeFilters } from '@recipe-app/contracts/types'
import type { ReactNode, RefObject } from 'react'
import { RecipeControls, type RecipeChoice } from './recipe-controls'
import { RecipeList } from './recipe-list'
import { RecipeListSkeleton } from './recipe-list-skeleton'
import { RecipeRequestError } from './recipe-request-error'
import { useRecipePages } from '@/features/recipes/hooks/use-recipe-pages'
import { SessionExpiredError } from '@/features/auth/errors'

type RecipeResultsProps = {
	userId: string
	endpoint: string
	categories: Category[]
	filters: RecipeFilters
	onFilter: (choice: RecipeChoice) => void
	onSort: (sort: Pick<RecipeFilters, 'sortBy' | 'order'>) => void
}

export function RecipeResults({ userId, endpoint, categories, filters, onFilter, onSort }: RecipeResultsProps) {
	const { query, sentinel, counts } = useRecipePages(userId, endpoint, filters)
	if (query.error instanceof SessionExpiredError) return <p role="status">Your session has expired. Returning to login...</p>
	const controls = <RecipeControls categories={categories} filters={filters} counts={counts} loading={query.isLoading} onFilter={onFilter} onSort={onSort} />
	const error = <RecipeRequestError error={query.error} laterPage={query.isFetchNextPageError} pending={query.isFetching} onRetry={() => {
		if (query.isFetchNextPageError) void query.fetchNextPage({ cancelRefetch: false })
		else void query.refetch()
	}} />
	if (!query.data) return <div className="flex flex-col gap-4">{controls}{query.isPending ? <RecipeListSkeleton /> : error}</div>
	const recipes = query.data.pages.flatMap((page) => page.data)
	const { meta, counts: loaded } = query.data.pages[0]
	return <div className="space-y-6">
		{controls}
		{loaded.total === 0 ? <EmptyLibrary /> : filters.favorites && loaded.favorites === 0 ? <EmptyFavorites /> : <RecipeList recipes={recipes} />}
		{error}
		<RecipeProgress loaded={recipes.length} total={meta.total} fetching={query.isFetchingNextPage} sentinel={sentinel} />
	</div>
}

function EmptyState({ title, children }: { title: string; children: ReactNode }) {
	return <div className="max-w-md space-y-2 rounded-2xl bg-accent/50 px-6 py-8">
		<h2 className="text-xl font-semibold tracking-tight">{title}</h2>
		<p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
	</div>
}

function EmptyLibrary() {
	return <EmptyState title="Your recipe library is empty.">Your recipes will appear here. Use New Recipe to add your first one.</EmptyState>
}

function EmptyFavorites() {
	return <EmptyState title="No favorites yet.">Use the heart on a recipe to save it here.</EmptyState>
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
