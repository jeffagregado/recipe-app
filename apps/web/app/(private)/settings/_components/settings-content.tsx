import { requireSession } from '@/features/auth/queries'
import { DisplayNameCard } from '@/features/settings/components/display-name-card'

/** Uncached read of the signed-in Account inside the page's Suspense boundary; anonymous visitors are redirected. */
export async function SettingsContent() {
	const { user } = await requireSession()
	// A save (here or on another device) changes the stored name, so the card remounts with it instead of keeping edited state.
	return <DisplayNameCard key={user.displayName} displayName={user.displayName} />
}
