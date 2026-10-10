'use client'

import { recipeSaveRequest } from '../lib/request-save'
import { SAVE_MESSAGES } from '../lib/save-recipe-result'
import { RecipeForm } from './recipe-form'

const save = recipeSaveRequest({ url: '/api/recipes', method: 'POST', notice: 'recipe-saved', messages: SAVE_MESSAGES })

export function CreateRecipeForm() {
	return <RecipeForm mode="create" title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={save} />
}
