'use cache'

import { cacheLife } from 'next/cache'
import { RecipeCard, type RecipeCardData } from './recipe-card'

type RecipeGridProps = {
	recipes: RecipeCardData[]
}

export async function RecipeGrid({ recipes }: RecipeGridProps) {
	cacheLife('hours')

	return (
		<ul
			aria-label="Recipes"
			className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4"
		>
			{recipes.map((recipe, index) => (
				<li key={recipe.id} className="min-w-0">
					<RecipeCard recipe={recipe} preload={index === 0} />
				</li>
			))}
		</ul>
	)
}
