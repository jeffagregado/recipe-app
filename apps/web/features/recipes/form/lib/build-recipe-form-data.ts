import { expectedRecipeUpdateFileFields } from '@recipe-app/contracts/schemas'
import type { CreateRecipeMetadata, UpdateRecipeMetadata } from '@recipe-app/contracts/types'

export type RecipeImageFiles = {
	cover: File | null
	/** Indexed by instruction position; entries are ignored unless the step declares `hasImage`. */
	steps: (File | null)[]
}

/** Multipart payload for the save action: `recipe`, `idempotencyKey`, optional `cover` and `step-<index>` parts. */
export function buildRecipeFormData(metadata: CreateRecipeMetadata, files: RecipeImageFiles, idempotencyKey: string): FormData {
	const data = new FormData()
	data.append('recipe', JSON.stringify(metadata))
	data.append('idempotencyKey', idempotencyKey)
	if (files.cover) data.append('cover', files.cover, files.cover.name)
	metadata.instructions.forEach((step, index) => {
		const photo = files.steps[index]
		if (step.hasImage && photo) data.append(`step-${index}`, photo, photo.name)
	})
	return data
}

/**
 * Multipart payload for the update action: `recipe`, `idempotencyKey` and one file per slot marked `replace`
 * (`cover`, `step-<index>` in the new step order). Kept and removed photos are never sent.
 */
export function buildRecipeUpdateFormData(metadata: UpdateRecipeMetadata, files: RecipeImageFiles, idempotencyKey: string): FormData {
	const data = new FormData()
	data.append('recipe', JSON.stringify(metadata))
	data.append('idempotencyKey', idempotencyKey)
	for (const field of expectedRecipeUpdateFileFields(metadata)) {
		const file = field === 'cover' ? files.cover : files.steps[Number(field.slice('step-'.length))]
		if (file) data.append(field, file, file.name)
	}
	return data
}
