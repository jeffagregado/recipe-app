'use client'

import { useState } from 'react'

import { RecipeCard, type RecipeCardData } from './recipe-card'

type RecipeGridProps = {
	recipes: RecipeCardData[]
}

export function RecipeGrid({ recipes }: RecipeGridProps) {
	const [favorites, setFavorites] = useState<Set<string>>(() => new Set())

	function toggleFavorite(id: string) {
		setFavorites((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

	return (
		<ul aria-label="Recipes" className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4">
			{recipes.map((recipe, index) => (
				<li key={recipe.id} className="min-w-0">
					<RecipeCard
						recipe={recipe}
						isFavorite={favorites.has(recipe.id)}
						onFavoriteToggle={() => toggleFavorite(recipe.id)}
						preload={index === 0}
					/>
				</li>
			))}
		</ul>
	)
}
