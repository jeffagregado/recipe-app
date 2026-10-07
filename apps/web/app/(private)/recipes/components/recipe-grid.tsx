'use client'

import { QueryClient, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { getRecipes } from '@/features/recipes/api'
import { toRecipeCard } from '../recipe-card-data'
import { RecipeCard } from './recipe-card'

export function RecipeGrid() {
	// Temporary client query until the NestJS recipe API replaces the Next.js sample endpoint.
	const [queryClient] = useState(() => new QueryClient())
	const query = useQuery({
		queryKey: ['recipes'],
		queryFn: ({ signal }) => getRecipes(signal),
		retry: false,
		refetchOnWindowFocus: false,
		staleTime: 60_000,
	}, queryClient)

	if (query.isPending) return <p role="status">Loading recipes...</p>

	if (query.isError) {
		return (
			<div role="alert" className="space-y-3">
				<p className="font-semibold">Could not load recipes.</p>
				<p className="text-sm text-muted-foreground wrap-break-word">{query.error.message} Check your connection and the recipe API, then retry.</p>
				<Button onClick={() => void query.refetch()} disabled={query.isFetching}>
					{query.isFetching ? 'Retrying...' : 'Retry'}
				</Button>
			</div>
		)
	}

	if (query.data.length === 0) return <p>No recipes yet.</p>

	return (
		<ul
			aria-label="Recipes"
			className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4"
		>
			{query.data.map((recipe, index) => (
				<li key={recipe.id} className="min-w-0">
					<RecipeCard recipe={toRecipeCard(recipe)} preload={index === 0} />
				</li>
			))}
		</ul>
	)
}
