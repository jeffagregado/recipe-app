import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { RecipeReadErrorBoundary } from '@/features/recipes/components/recipe-read-error'
import { RecipeSession } from '@/features/recipes/components/recipe-session'
import { CreateRecipeContent } from './_components/create-recipe-content'
import { RecipeFormLoading } from '@/features/recipes/form/components/recipe-form-loading'

export const metadata: Metadata = { title: 'Create Recipe' }

export default function CreateRecipePage() {
	return (
		<SessionErrorBoundary>
			<Suspense fallback={<RecipeFormLoading />}>
				<RecipeSession>
					<RecipeReadErrorBoundary contained subject="your categories">
						<CreateRecipeContent />
					</RecipeReadErrorBoundary>
				</RecipeSession>
			</Suspense>
		</SessionErrorBoundary>
	)
}
