import type { RecipeListItem } from '@recipe-app/contracts/types'

import pastaPhoto from '@/public/recipes/creamy-garlic-pasta.png'
import type { RecipeCardData } from '../_components/recipe-card'

// Presentation metadata belongs to the preview UI, not the recipe API contract.
const previewIds = new Set([
	'creamy-garlic-pasta',
	'creamy-garlic-pasta2',
	'creamy-garlic-pasta3',
	'creamy-garlic-pasta4',
])

export function toRecipeCard(recipe: RecipeListItem): RecipeCardData {
	const isPreview = previewIds.has(recipe.id)

	return {
		...recipe,
		imageUrl: isPreview && recipe.imageUrl === null ? pastaPhoto.src : recipe.imageUrl,
		updatedLabel: isPreview ? '2 days ago' : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(recipe.updatedAt)),
	}
}
