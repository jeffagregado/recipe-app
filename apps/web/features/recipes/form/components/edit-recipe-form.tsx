'use client'

import type { Category } from '@recipe-app/contracts/types'
import type { RecipeFormValues } from '../lib/recipe-form-schema'
import { recipeSaveRequest } from '../lib/request-save'
import { UPDATE_MESSAGES } from '../lib/save-recipe-result'
import { discardPendingPhoto, uploadPendingPhoto } from '../lib/upload-pending-photo'
import { RecipeForm } from './recipe-form'

type EditRecipeFormProps = { recipeId: string; categories: Category[]; initialValues: RecipeFormValues }

export function EditRecipeForm({ recipeId, categories, initialValues }: EditRecipeFormProps) {
	const path = encodeURIComponent(recipeId)
	const save = recipeSaveRequest({ url: `/api/recipes/${path}`, method: 'PATCH', notice: 'recipe-updated', messages: UPDATE_MESSAGES })

	return <RecipeForm mode="edit" title="Edit Recipe" submitLabel="Save Changes" cancelHref={`/recipes/${path}`} onSave={save} onUploadPhoto={uploadPendingPhoto} onDiscardPhoto={discardPendingPhoto} categories={categories} initialValues={initialValues} />
}
