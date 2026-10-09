import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { CreateRecipeContent } from './_components/create-recipe-content'
import { CreateRecipeLoading } from './_components/create-recipe-loading'

export const metadata: Metadata = { title: 'Create Recipe' }

export default function CreateRecipePage() {
	return (
		<SessionErrorBoundary>
			<Suspense fallback={<CreateRecipeLoading />}>
				<CreateRecipeContent />
			</Suspense>
		</SessionErrorBoundary>
	)
}
