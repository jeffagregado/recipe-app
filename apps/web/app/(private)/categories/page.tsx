import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { RecipeReadErrorBoundary } from '@/features/recipes/components/recipe-read-error'
import { RecipeSession } from '@/features/recipes/components/recipe-session'
import { CategoriesContent } from './_components/categories-content'
import { CategoriesLoading } from './_components/categories-loading'

export const metadata: Metadata = { title: 'Categories' }

export default function CategoriesPage() {
	return (
		<SessionErrorBoundary>
			<Suspense fallback={<CategoriesLoading />}>
				<RecipeSession>
					<RecipeReadErrorBoundary contained subject="your categories">
						<CategoriesContent />
					</RecipeReadErrorBoundary>
				</RecipeSession>
			</Suspense>
		</SessionErrorBoundary>
	)
}
