import type { RecipeFilters, RecipeListResponse } from '@recipe-app/contracts/types'
import { infiniteQueryOptions } from '@tanstack/react-query'
import { fetchRecipePage, RECIPE_PAGE_SIZE } from '../api/request'

export function recipeQueryOptions(endpoint: string, filters: RecipeFilters) {
	return infiniteQueryOptions({
		queryKey: ['recipes', endpoint, filters.search ?? null, filters.category ?? null, filters.sortBy, filters.order, RECIPE_PAGE_SIZE] as const,
		queryFn: ({ pageParam, signal }) => fetchRecipePage(endpoint, filters, pageParam, signal),
		initialPageParam: 1,
		getNextPageParam: ({ meta }: RecipeListResponse) => meta.page < meta.totalPages ? meta.page + 1 : undefined,
		staleTime: 30_000,
		// Discard inactive lists so revisiting filters starts at page one.
		gcTime: 0,
		retry: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		networkMode: 'always',
	})
}
