import { notFound } from 'next/navigation'
import { Suspense } from 'react'

import { requireSession } from '@/features/auth/queries'

/** Any /recipes/... URL no route matches (for example /recipes/create/nope) lands here, inside the private layout. */
async function UnknownPrivatePage() {
	// Same gate as every private page, so a signed-out visitor is sent to `/` rather than shown the countdown.
	await requireSession()
	return notFound()
}

export default function UnknownRecipesPage() {
	return (
		<Suspense fallback={null}>
			<UnknownPrivatePage />
		</Suspense>
	)
}
