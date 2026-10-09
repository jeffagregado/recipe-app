import { createRecipeMetadataSchema, updateRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { buildRecipeFormData, buildRecipeUpdateFormData, type RecipeImageFiles } from './build-recipe-form-data'
import { toUpdateRecipeMetadata } from './recipe-edit'
import { toCreateRecipeMetadata, type RecipeFormValues } from './recipe-form-schema'
import { photoUpload } from './recipe-photo'

export type RecipeFormMode = 'create' | 'edit'

export type RecipePayload = {
	/** Identifies the exact request (text, image slot states and files). A submission key may only be reused for an equal fingerprint. */
	fingerprint: string
	build: (idempotencyKey: string) => FormData
}

const fileSignature = (file: File | null) => (file ? `${file.name}:${file.size}:${file.lastModified}` : null)

/** Validates the form values with the API's own schema for the mode; null means they cannot be sent. */
export function prepareRecipePayload(mode: RecipeFormMode, values: RecipeFormValues): RecipePayload | null {
	const files: RecipeImageFiles = { cover: photoUpload(values.cover), steps: values.instructions.map((step) => photoUpload(step.photo)) }
	const fingerprint = (metadata: object) => JSON.stringify([metadata, fileSignature(files.cover), files.steps.map(fileSignature)])

	if (mode === 'edit') {
		const parsed = updateRecipeMetadataSchema.safeParse(toUpdateRecipeMetadata(values))
		if (!parsed.success) return null
		return { fingerprint: fingerprint(parsed.data), build: (key) => buildRecipeUpdateFormData(parsed.data, files, key) }
	}
	const parsed = createRecipeMetadataSchema.safeParse(toCreateRecipeMetadata(values))
	if (!parsed.success) return null
	return { fingerprint: fingerprint(parsed.data), build: (key) => buildRecipeFormData(parsed.data, files, key) }
}
