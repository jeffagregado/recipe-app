import { requireSession } from '@/features/auth/queries'
import { DisplayNameCard } from '@/features/settings/components/display-name-card'
import { PasswordCard } from '@/features/settings/components/password-card'
import { SignInMethodsCard } from '@/features/settings/components/sign-in-methods-card'

/** Uncached read of the signed-in Account inside the page's Suspense boundary; anonymous visitors are redirected. */
export async function SettingsContent() {
	const { user } = await requireSession()
	return (
		<>
			<DisplayNameCard displayName={user.displayName} />
			<PasswordCard hasPassword={user.hasPassword} />
			<SignInMethodsCard hasPassword={user.hasPassword} google={user.google} />
		</>
	)
}
