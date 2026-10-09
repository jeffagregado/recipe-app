import type { RecipeDetail } from '@recipe-app/contracts/types'

/** Valid minimal detail payload for tests; override fields per case. */
export function recipeDetailFixture(overrides: Partial<RecipeDetail> = {}): RecipeDetail {
	return {
		id: 'recipe-1',
		userId: 'user-1',
		title: 'Tomato Soup',
		categories: [],
		description: null,
		imageUrl: null,
		servings: null,
		prepTimeMinutes: null,
		cookTimeMinutes: null,
		notes: null,
		videoUrl: null,
		ingredients: [{ id: 'ing-1', ingredientId: 'base-1', name: 'Tomatoes', quantity: 2, unit: 'piece', preparation: null, note: null, sortOrder: 0 }],
		instructions: [{ id: 'step-1', stepNumber: 1, description: 'Simmer.', imageUrl: null }],
		createdAt: '2026-10-09T10:00:00.000Z',
		updatedAt: '2026-10-09T10:00:00.000Z',
		...overrides,
	}
}
