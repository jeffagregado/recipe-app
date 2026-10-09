import { notFound } from 'next/navigation'

import { getRecipe } from '@/features/recipes/queries/get-recipe'
import { RecipeDetailView } from './recipe-detail-view'

type RecipeDetailContentProps = {
	params: Promise<{ id: string }>
}

/** Resolves request-time inputs and the uncached read inside the page's Suspense boundary. */
export async function RecipeDetailContent({ params }: RecipeDetailContentProps) {
	const { id } = await params
	const recipe = await getRecipe(id)
	if (!recipe) notFound()
	return <RecipeDetailView recipe={recipe} />
}
