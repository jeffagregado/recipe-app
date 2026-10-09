import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import PageContainer from '@/components/layout/page-container'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { RecipeDetailContent } from './_components/recipe-detail-content'
import { RecipeDetailErrorBoundary } from './_components/recipe-detail-error'
import { RecipeDetailLoading } from './_components/recipe-detail-loading'
import { RecipeDetailSession } from './_components/recipe-detail-session'

export const metadata: Metadata = { title: 'Recipe' }

export default function RecipePage({ params, searchParams }: PageProps<'/recipes/[id]'>) {
	return (
		<PageContainer size="default" className="space-y-6">
			<Link href="/recipes" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium underline-offset-4 hover:underline">
				<ArrowLeft aria-hidden="true" className="size-4" />
				Back to Recipes
			</Link>
			<SessionErrorBoundary>
				<Suspense fallback={<RecipeDetailLoading />}>
					<RecipeDetailSession>
						<RecipeDetailErrorBoundary>
							<RecipeDetailContent params={params} searchParams={searchParams} />
						</RecipeDetailErrorBoundary>
					</RecipeDetailSession>
				</Suspense>
			</SessionErrorBoundary>
		</PageContainer>
	)
}
