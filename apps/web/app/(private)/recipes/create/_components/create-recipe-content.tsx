import { getCategories } from '@/features/categories/queries/get-categories'
import { CreateRecipeForm } from '@/features/recipes/form/components/create-recipe-form'

/** The category read checks the session first, so anonymous visitors are redirected before any form renders. */
export async function CreateRecipeContent() {
	const categories = await getCategories()
	return <CreateRecipeForm categories={categories.map(({ id, name }) => ({ id, name }))} />
}
