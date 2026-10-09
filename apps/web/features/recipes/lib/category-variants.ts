import type { RecipeCategory } from '@recipe-app/contracts/types'

/** Badge variant per recipe category, shared by list cards and the detail page. */
export const categoryVariants = {
	Breakfast: 'breakfast',
	Lunch: 'lunch',
	Dinner: 'dinner',
	Snacks: 'snack',
	Desserts: 'dessert',
} as const satisfies Record<RecipeCategory, string>
