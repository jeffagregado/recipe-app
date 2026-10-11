import type { RecipeDetail, RecipeImageSlot, UpdateRecipeMetadata } from '@recipe-app/contracts/types'
import { TO_TASTE, toSharedMetadata, type RecipeFormValues } from './recipe-form-schema'
import { existingPhoto, type PhotoValue } from './recipe-photo'

const text = (value: number | null) => (value === null ? '' : String(value))

/** Pre-fills the form from a stored recipe: numbers become the strings the form edits and stored photos become `existing` slots. */
export function toRecipeFormValues(recipe: RecipeDetail): RecipeFormValues {
	return {
		title: recipe.title,
		description: recipe.description ?? '',
		categories: recipe.categories.map(({ id }) => id),
		prepTime: text(recipe.prepTimeMinutes),
		cookTime: text(recipe.cookTimeMinutes),
		servings: text(recipe.servings),
		videoUrl: recipe.videoUrl ?? '',
		notes: recipe.notes ?? '',
		cover: existingPhoto(recipe.imageUrl),
		ingredients: recipe.ingredients.toSorted((a, b) => a.sortOrder - b.sortOrder).map((row) => (
			row.quantity === null || row.unit === null
				? { name: row.name, amount: '', unit: TO_TASTE }
				: { name: row.name, amount: String(row.quantity), unit: row.unit }
		)),
		instructions: recipe.instructions.toSorted((a, b) => a.stepNumber - b.stepNumber).map((step) => (
			{ id: step.id, description: step.description, photo: existingPhoto(step.imageUrl) }
		)),
	}
}

/** An untouched stored photo is kept, a file picked in this session replaces it, and anything else leaves the slot empty. */
const slot = (photo: PhotoValue): RecipeImageSlot => {
	if (photo.kind === 'existing') return 'keep'
	return photo.kind === 'new' ? 'replace' : 'remove'
}

/** Maps form values to the update metadata: stored steps keep their id so their photo can follow them, new steps carry none. */
export function toUpdateRecipeMetadata(values: RecipeFormValues): UpdateRecipeMetadata {
	return {
		...toSharedMetadata(values),
		cover: slot(values.cover),
		instructions: values.instructions.map((step) => ({ id: step.id, description: step.description.trim(), image: slot(step.photo) })),
	}
}
