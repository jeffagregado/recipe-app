import { Suspense } from 'react'
import { requireSession } from '@/features/auth/queries'
import { SessionErrorBoundary } from '@/features/auth/session-error'

async function RecipePlaceholder({ params }: { params: Promise<{ id: string }> }) {
	await requireSession()
	const { id } = await params
	return <div><h1>Recipe {id}</h1><p>Recipe details are unavailable for now.</p></div>
}

export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
	return <SessionErrorBoundary><Suspense fallback={<p role="status">Checking session...</p>}><RecipePlaceholder params={params} /></Suspense></SessionErrorBoundary>
}
