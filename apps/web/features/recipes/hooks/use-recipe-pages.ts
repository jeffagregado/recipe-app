'use client'

import type { RecipeFilters } from '@recipe-app/contracts/types'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { recipeQueryOptions } from '../queries/recipe-query'

export function useRecipePages(endpoint: string, filters: RecipeFilters) {
	const query = useInfiniteQuery(recipeQueryOptions(endpoint, filters))
	const sentinel = useRef<HTMLDivElement>(null)
	const { hasNextPage, isFetching, isError, fetchNextPage } = query
	const canObserve = hasNextPage && !isFetching && !isError
	useEffect(() => {
		const node = sentinel.current
		if (!node || !canObserve) return
		const observer = new IntersectionObserver(([entry]) => {
			if (entry.isIntersecting) void fetchNextPage({ cancelRefetch: false })
		}, { rootMargin: '200px' })
		observer.observe(node)
		return () => observer.disconnect()
	}, [canObserve, fetchNextPage])
	return { query, sentinel }
}
