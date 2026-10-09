import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { RecipeReadErrorBoundary } from '@/features/recipes/components/recipe-read-error'
import { RecipeSession } from '@/features/recipes/components/recipe-session'
import { RecipeFormLoading } from '@/features/recipes/form/components/recipe-form-loading'
import { EditRecipeContent } from './_components/edit-recipe-content'

export const metadata: Metadata = { title: 'Edit Recipe' }

export default function EditRecipePage({ params }: PageProps<'/recipes/[id]/edit'>) {
	return (
		<SessionErrorBoundary>
			<Suspense fallback={<RecipeFormLoading />}>
				<RecipeSession>
					<RecipeReadErrorBoundary contained>
						<EditRecipeContent params={params} />
					</RecipeReadErrorBoundary>
				</RecipeSession>
			</Suspense>
		</SessionErrorBoundary>
	)
}
