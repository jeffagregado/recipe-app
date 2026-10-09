import type { RecipeDetail } from '@recipe-app/contracts/types'

const quantityFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3, useGrouping: false })

type Ingredient = RecipeDetail['ingredients'][number]

/** Amount text such as "1.5 cup", or null for "to taste" rows. */
export function ingredientAmount({ quantity, unit }: Pick<Ingredient, 'quantity' | 'unit'>): string | null {
	if (quantity === null || unit === null) return null
	return `${quantityFormat.format(quantity)} ${unit}`
}

/** Meta labels in display order; zero minutes is a value, only null is omitted. */
export function recipeMetaLabels({ prepTimeMinutes, cookTimeMinutes, servings }: Pick<RecipeDetail, 'prepTimeMinutes' | 'cookTimeMinutes' | 'servings'>): string[] {
	return [
		prepTimeMinutes !== null ? `Prep ${prepTimeMinutes} min` : null,
		cookTimeMinutes !== null ? `Cook ${cookTimeMinutes} min` : null,
		prepTimeMinutes !== null && cookTimeMinutes !== null ? `Total ${prepTimeMinutes + cookTimeMinutes} min` : null,
		servings !== null ? `${servings} ${servings === 1 ? 'serving' : 'servings'}` : null,
	].filter((label) => label !== null)
}
