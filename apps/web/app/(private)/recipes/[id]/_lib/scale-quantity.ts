import { kitchenAmount } from '@/features/recipes/lib/kitchen-amount'

export const MIN_SERVINGS = 1
export const MAX_SERVINGS = 99


/**
 * Amount text such as "1½ tbsp", scaled from the recipe's own servings to the chosen ones.
 * Amounts show as kitchen fractions where one fits; at the original servings the stored value is shown unchanged.
 * Rows without a quantity or unit are "to taste" and never change.
 */
export function scaledAmount(quantity: number | null, unit: string | null, originalServings: number, servings: number): string {
	if (quantity === null || unit === null) return 'to taste'
	const text = servings === originalServings ? kitchenAmount(quantity, 'stored') : kitchenAmount((quantity * servings) / originalServings, 'scaled')
	return `${text} ${unit}`
}

/** Servings stay within 1–99, or up to the stored count when the recipe was saved with more than 99. */
export function clampServings(servings: number, originalServings: number): number {
	return Math.min(Math.max(servings, MIN_SERVINGS), Math.max(MAX_SERVINGS, originalServings))
}
