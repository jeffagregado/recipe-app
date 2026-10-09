import { Suspense } from 'react'
import PageContainer from '@/components/layout/page-container'
import { requireSession } from '@/features/auth/queries'
import { SessionErrorBoundary } from '@/features/auth/session-error'

async function CreateUnavailable() {
	await requireSession()
	return <p>Create Recipe is unavailable for now.</p>
}

export default function CreateRecipePage() {
	return <PageContainer><h1 className="mb-4 text-3xl font-bold">Create Recipe</h1>
		<SessionErrorBoundary><Suspense fallback={<p role="status">Checking session...</p>}><CreateUnavailable /></Suspense></SessionErrorBoundary>
	</PageContainer>
}
