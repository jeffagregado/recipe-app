import { io } from 'next/cache'

import { getRecipes } from '@/features/recipes/api'
import { toRecipeCard } from '../recipe-card-data'
import { RecipeCard } from './recipe-card'

export async function RecipeGrid() {
	// Keep API availability independent of build-time prerendering.
	await io()
	const recipes = await getRecipes()
	if (recipes.length === 0) return <p>No recipes yet.</p>

	return (
		<ul
			aria-label="Recipes"
			className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4"
		>
			{recipes.map((recipe, index) => (
				<li key={recipe.id} className="min-w-0">
					<RecipeCard recipe={toRecipeCard(recipe)} preload={index === 0} />
				</li>
			))}
		</ul>
	)
}
