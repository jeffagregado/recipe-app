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

const updatedDate = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })

/** The total when both times are known, else the one that is, else nothing. Zero minutes is a value. */
function timeLabel({ prepTimeMinutes, cookTimeMinutes }: Pick<RecipeListItem, 'prepTimeMinutes' | 'cookTimeMinutes'>): string | null {
	if (prepTimeMinutes !== null && cookTimeMinutes !== null) return `${prepTimeMinutes + cookTimeMinutes} min`
	if (prepTimeMinutes !== null) return `Prep ${prepTimeMinutes} min`
	if (cookTimeMinutes !== null) return `Cook ${cookTimeMinutes} min`
	return null
}

export function toRecipeCard(recipe: RecipeListItem): RecipeCardData {
	const isPreview = previewIds.has(recipe.id)

	return {
		...recipe,
		imageUrl: isPreview && recipe.imageUrl === null ? pastaPhoto.src : recipe.imageUrl,
		timeLabel: timeLabel(recipe),
		servingsLabel: recipe.servings === null ? null : `${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'}`,
		updatedLabel: isPreview ? '2 days ago' : updatedDate.format(new Date(recipe.updatedAt)),
	}
}
