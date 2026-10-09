import { notFound } from 'next/navigation'

import { getRecipe } from '@/features/recipes/queries/get-recipe'
import { RecipeDetailView } from './recipe-detail-view'

type RecipeDetailContentProps = {
	params: Promise<{ id: string }>
	searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** Resolves request-time inputs and the uncached read inside the page's Suspense boundary. */
export async function RecipeDetailContent({ params, searchParams }: RecipeDetailContentProps) {
	const [{ id }, { notice }] = await Promise.all([params, searchParams])
	const recipe = await getRecipe(id)
	if (!recipe) notFound()
	return <RecipeDetailView recipe={recipe} saved={notice === 'recipe-saved'} />
}
