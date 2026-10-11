import { PageNotFound } from '@/components/layout/page-not-found'
import { getCategories } from '@/features/categories/queries/get-categories'
import { EditRecipeForm } from '@/features/recipes/form/components/edit-recipe-form'
import { toRecipeFormValues } from '@/features/recipes/form/lib/recipe-edit'
import { getRecipe } from '@/features/recipes/queries/get-recipe'

type EditRecipeContentProps = {
	params: Promise<{ id: string }>
}

/**
 * Resolves request-time inputs and the uncached owner-scoped read inside the page's Suspense boundary. An unknown or foreign recipe
 * renders the not-found page rather than throwing `notFound()`, which would surface as a React #419 error in the browser mid-stream.
 */
export async function EditRecipeContent({ params }: EditRecipeContentProps) {
	const { id } = await params
	const [recipe, categories] = await Promise.all([getRecipe(id), getCategories()])
	if (!recipe) return <PageNotFound />

	return (
		// A saved update changes updatedAt, so a hidden (preserved) edit page remounts with the saved values instead of the ones from before.
		<EditRecipeForm
			key={`${recipe.id}:${recipe.updatedAt}`}
			recipeId={recipe.id}
			categories={categories.map(({ id, name }) => ({ id, name }))}
			initialValues={toRecipeFormValues(recipe)}
		/>
	)
}
