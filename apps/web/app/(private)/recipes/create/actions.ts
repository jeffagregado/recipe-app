'use server'

import { createRecipeMetadataSchema, expectedRecipeFileFields } from '@recipe-app/contracts/schemas'
import { submitRecipe } from '@/features/recipes/api/save-recipe'
import { SAVE_MESSAGES, type SaveRecipeResult } from '@/features/recipes/form/lib/save-recipe-result'

/** Resolves only with the result the form should show; a confirmed save redirects to the new recipe. */
export async function saveRecipe(formData: FormData): Promise<SaveRecipeResult> {
	return submitRecipe(formData, {
		method: 'POST',
		path: '/recipes',
		messages: SAVE_MESSAGES,
		metadataSchema: createRecipeMetadataSchema,
		expectedFiles: (metadata, files) => expectedRecipeFileFields(metadata, files.has('cover')),
		notice: 'recipe-saved',
	})
}
