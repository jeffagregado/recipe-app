'use client'

import type { RecipeFilters } from '@recipe-app/contracts/types'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { recipeQueryOptions } from '../queries/recipe-query'
import { SessionExpiredError } from '@/features/auth/errors'
import { leavePrivateSession } from '@/features/auth/session-client'

export function useRecipePages(userId: string, endpoint: string, filters: RecipeFilters) {
	const query = useInfiniteQuery(recipeQueryOptions(userId, endpoint, filters))
	useEffect(() => {
		if (query.error instanceof SessionExpiredError) leavePrivateSession()
	}, [query.error])
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
