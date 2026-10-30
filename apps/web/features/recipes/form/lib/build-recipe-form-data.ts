import type { CreateRecipeMetadata, UpdateRecipeMetadata } from '@recipe-app/contracts/types'

/** The save action's payload: `recipe` and `idempotencyKey`. Photos are named in the metadata as Pending photos, never sent. */
export function buildRecipeFormData(metadata: CreateRecipeMetadata | UpdateRecipeMetadata, idempotencyKey: string): FormData {
	const data = new FormData()
	data.append('recipe', JSON.stringify(metadata))
	data.append('idempotencyKey', idempotencyKey)
	return data
}
