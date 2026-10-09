import { Suspense } from 'react'

import { PageNotFound } from '@/components/layout/page-not-found'
import { requireSession } from '@/features/auth/queries'

/** Any /recipes/... URL no route matches (for example /recipes/create/nope) lands here, inside the private layout. */
async function UnknownPrivatePage() {
	// Same gate as every private page, so a signed-out visitor is sent to `/` rather than shown the countdown.
	await requireSession()
	return <PageNotFound />
}

export default function UnknownRecipesPage() {
	return (
		<Suspense fallback={null}>
			<UnknownPrivatePage />
		</Suspense>
	)
}
