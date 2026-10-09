import { requireSession } from '@/features/auth/queries'
import { saveRecipe } from '../actions'
import { RecipeForm } from '@/features/recipes/form/components/recipe-form'

/** Runs after the session check so anonymous visitors are redirected before any form renders. */
export async function CreateRecipeContent() {
	await requireSession()
	return <RecipeForm mode="create" title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={saveRecipe} />
}
