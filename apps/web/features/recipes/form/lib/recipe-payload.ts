import { createRecipeMetadataSchema, updateRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { buildRecipeFormData } from './build-recipe-form-data'
import { toUpdateRecipeMetadata } from './recipe-edit'
import { toCreateRecipeMetadata, type RecipeFormValues } from './recipe-form-schema'

export type RecipeFormMode = 'create' | 'edit'

export type RecipePayload = {
	/** Identifies the exact request: its text and image slots, Pending photo ids included. A submission key may only be reused for an equal fingerprint. */
	fingerprint: string
	build: (idempotencyKey: string) => FormData
}

/** Validates the form values with the API's own schema for the mode; null means they cannot be sent. */
export function prepareRecipePayload(mode: RecipeFormMode, values: RecipeFormValues): RecipePayload | null {
	// A photo still uploading or failed is no Pending photo yet; sending without it would drop it silently.
	const photos = [values.cover, ...values.instructions.flatMap((group) => group.steps.map((step) => step.photo))]
	if (photos.some((photo) => photo.kind === 'picked')) return null
	const parsed = mode === 'edit' ? updateRecipeMetadataSchema.safeParse(toUpdateRecipeMetadata(values)) : createRecipeMetadataSchema.safeParse(toCreateRecipeMetadata(values))
	if (!parsed.success) return null
	return { fingerprint: JSON.stringify(parsed.data), build: (key) => buildRecipeFormData(parsed.data, key) }
}
