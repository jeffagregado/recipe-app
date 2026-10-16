import type { RecipeListItem } from '@recipe-app/contracts/types'
import { RecipeCard } from './recipe-card'
import { toRecipeCard } from '../_lib/recipe-card-data'

/** The list's column rule; the skeleton borrows it so the two line up while a page streams in. */
export const recipeGridClassName = 'grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'

export function RecipeList({ recipes }: { recipes: RecipeListItem[] }) {
	if (recipes.length === 0) return <p className="text-muted-foreground">No recipes match your filters. Try another search or category.</p>
	return <ul aria-label="Recipes" className={recipeGridClassName}>
		{recipes.map((recipe, index) => <li key={recipe.id} className="min-w-0">
			<RecipeCard recipe={toRecipeCard(recipe)} preload={index === 0} />
		</li>)}
	</ul>
}
