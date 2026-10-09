import { PageNotFoundBlock } from '@/components/layout/page-not-found'
import { getRecipe } from '@/features/recipes/queries/get-recipe'
import { RecipeDetailView } from './recipe-detail-view'

type RecipeDetailContentProps = {
	params: Promise<{ id: string }>
}

/**
 * Resolves request-time inputs and the uncached read inside the page's Suspense boundary. An unknown or foreign recipe renders the
 * not-found card rather than throwing `notFound()`, which would surface as a React #419 error in the browser mid-stream.
 */
export async function RecipeDetailContent({ params }: RecipeDetailContentProps) {
	const { id } = await params
	const recipe = await getRecipe(id)
	if (!recipe) return <PageNotFoundBlock />
	return <RecipeDetailView recipe={recipe} />
}
