'use client'

import type { Category } from '@recipe-app/contracts/types'
import { recipeSaveRequest } from '../lib/request-save'
import { SAVE_MESSAGES } from '../lib/save-recipe-result'
import { uploadPendingPhoto } from '../lib/upload-pending-photo'
import { RecipeForm } from './recipe-form'

const save = recipeSaveRequest({ url: '/api/recipes', method: 'POST', notice: 'recipe-saved', messages: SAVE_MESSAGES })

export function CreateRecipeForm({ categories }: { categories: Category[] }) {
	return <RecipeForm mode="create" title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={save} onUploadPhoto={uploadPendingPhoto} categories={categories} />
}
