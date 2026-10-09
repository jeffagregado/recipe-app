'use server'

import { expectedRecipeUpdateFileFields, updateRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { submitRecipe } from '@/features/recipes/api/save-recipe'
import { UPDATE_MESSAGES, type SaveRecipeResult } from '@/features/recipes/form/lib/save-recipe-result'
import { isValidRecipeId } from '@/features/recipes/lib/recipe-id'

/**
 * Resolves only with the result the form should show; a confirmed update redirects to the recipe page.
 * A recipe that is gone (404) is reported on the form rather than redirected, so the user keeps what they typed.
 */
export async function updateRecipe(recipeId: string, formData: FormData): Promise<SaveRecipeResult> {
	if (!isValidRecipeId(recipeId)) return { status: 'not-found', message: UPDATE_MESSAGES.notFound }
	return submitRecipe(formData, {
		method: 'PATCH',
		path: `/recipes/${encodeURIComponent(recipeId)}`,
		messages: UPDATE_MESSAGES,
		metadataSchema: updateRecipeMetadataSchema,
		expectedFiles: (metadata) => expectedRecipeUpdateFileFields(metadata),
		notFound: UPDATE_MESSAGES.notFound,
		notice: 'recipe-updated',
	})
}
