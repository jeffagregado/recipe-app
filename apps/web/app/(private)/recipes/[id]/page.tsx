import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import PageContainer from '@/components/layout/page-container'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { RecipeDetailContent } from './_components/recipe-detail-content'
import { RecipeReadErrorBoundary } from '@/features/recipes/components/recipe-read-error'
import { RecipeDetailLoading } from './_components/recipe-detail-loading'
import { RecipeSession } from '@/features/recipes/components/recipe-session'

export const metadata: Metadata = { title: 'Recipe' }

export default function RecipePage({ params }: PageProps<'/recipes/[id]'>) {
	return (
		<PageContainer className="space-y-5 lg:space-y-6">
			<Link href="/recipes" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
				<ArrowLeft aria-hidden="true" className="size-4" />
				Back to Recipes
			</Link>
			<SessionErrorBoundary>
				<Suspense fallback={<RecipeDetailLoading />}>
					<RecipeSession>
						<RecipeReadErrorBoundary>
							<RecipeDetailContent params={params} />
						</RecipeReadErrorBoundary>
					</RecipeSession>
				</Suspense>
			</SessionErrorBoundary>
		</PageContainer>
	)
}
