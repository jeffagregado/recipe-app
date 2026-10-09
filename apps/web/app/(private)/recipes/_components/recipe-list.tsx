import type { RecipeListItem } from '@recipe-app/contracts/types'
import { RecipeCard } from './recipe-card'
import { toRecipeCard } from '../_lib/recipe-card-data'

export function RecipeList({ recipes }: { recipes: RecipeListItem[] }) {
	if (recipes.length === 0) return <p>No recipes match your filters. Try another search or category.</p>
	return <ul aria-label="Recipes" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4">
		{recipes.map((recipe, index) => <li key={recipe.id} className="min-w-0">
			<RecipeCard recipe={toRecipeCard(recipe)} preload={index === 0} />
		</li>)}
	</ul>
}
