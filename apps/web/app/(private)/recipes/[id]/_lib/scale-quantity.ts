export const MIN_SERVINGS = 1
export const MAX_SERVINGS = 99

const scaledFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, useGrouping: false })
// Stored quantities have up to three decimals (numeric(12,3)); unscaled amounts show them exactly.
const storedFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3, useGrouping: false })

/**
 * Amount text such as "1.5 tbsp", scaled from the recipe's own servings to the chosen ones.
 * Scaled values round to at most two decimals; at the original servings the stored value is shown unchanged.
 * Rows without a quantity or unit are "to taste" and never change.
 */
export function scaledAmount(quantity: number | null, unit: string | null, originalServings: number, servings: number): string {
	if (quantity === null || unit === null) return 'to taste'
	const text = servings === originalServings ? storedFormat.format(quantity) : scaledFormat.format((quantity * servings) / originalServings)
	return `${text} ${unit}`
}

/** Servings stay within 1–99, or up to the stored count when the recipe was saved with more than 99. */
export function clampServings(servings: number, originalServings: number): number {
	return Math.min(Math.max(servings, MIN_SERVINGS), Math.max(MAX_SERVINGS, originalServings))
}
