import { notFound } from 'next/navigation'
import { RecipeForm } from '@/features/recipes/form/components/recipe-form'
import { toRecipeFormValues } from '@/features/recipes/form/lib/recipe-edit'
import { getRecipe } from '@/features/recipes/queries/get-recipe'
import { updateRecipe } from '../actions'

type EditRecipeContentProps = {
	params: Promise<{ id: string }>
}

/** Resolves request-time inputs and the uncached owner-scoped read inside the page's Suspense boundary. */
export async function EditRecipeContent({ params }: EditRecipeContentProps) {
	const { id } = await params
	const recipe = await getRecipe(id)
	if (!recipe) notFound()

	return (
		<RecipeForm
			// A saved update changes updatedAt, so a hidden (preserved) edit page remounts with the saved values instead of the ones from before.
			key={`${recipe.id}:${recipe.updatedAt}`}
			mode="edit"
			title="Edit Recipe"
			submitLabel="Save Changes"
			cancelHref={`/recipes/${encodeURIComponent(recipe.id)}`}
			onSave={updateRecipe.bind(null, recipe.id)}
			initialValues={toRecipeFormValues(recipe)}
		/>
	)
}
