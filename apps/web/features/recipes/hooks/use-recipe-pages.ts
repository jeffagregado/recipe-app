'use client'

import type { RecipeFilters } from '@recipe-app/contracts/types'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { recipeQueryOptions } from '../queries/recipe-query'
import { useConfirmedFavorites } from './use-favorite'
import { SessionExpiredError } from '@/features/auth/errors'
import { leavePrivateSession } from '@/features/auth/session-client'

export function useRecipePages(userId: string, endpoint: string, filters: RecipeFilters) {
	const query = useInfiniteQuery(recipeQueryOptions(userId, endpoint, filters))
	useEffect(() => {
		if (query.error instanceof SessionExpiredError) leavePrivateSession()
	}, [query.error])
	const { saves, net } = useConfirmedFavorites()
	const loadedSaves = useRef(saves)
	const { hasNextPage, isFetching, isError, fetchNextPage, refetch } = query
	useEffect(() => {
		// A confirmed heart changes which recipes belong in the favorites list; every other list keeps its rows and recounts below.
		// Refetching keeps the pages already loaded, and runs on return when the heart changed on a recipe page meanwhile.
		if (!filters.favorites || loadedSaves.current === saves) return
		loadedSaves.current = saves
		void refetch()
	}, [filters.favorites, saves, refetch])
	const sentinel = useRef<HTMLDivElement>(null)
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
	// The server counted favorites when it read the first page; hearts this tab confirmed since then are added on top.
	const first = query.data?.pages[0]
	const [counted, setCounted] = useState({ first, net })
	if (counted.first !== first) setCounted({ first, net })
	const counts = first && { ...first.counts, favorites: Math.max(0, first.counts.favorites + net - counted.net) }
	return { query, sentinel, counts }
}
