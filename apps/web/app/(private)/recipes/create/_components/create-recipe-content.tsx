import { requireSession } from '@/features/auth/queries'
import { CreateRecipeForm } from '@/features/recipes/form/components/create-recipe-form'

/** Runs after the session check so anonymous visitors are redirected before any form renders. */
export async function CreateRecipeContent() {
	await requireSession()
	return <CreateRecipeForm />
}
