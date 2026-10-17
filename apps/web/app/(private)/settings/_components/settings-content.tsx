import { requireSession } from '@/features/auth/queries'
import { DemoSettings } from '@/features/demo/demo-settings'
import { DisplayNameCard } from '@/features/settings/components/display-name-card'
import { EmailCard } from '@/features/settings/components/email-card'
import { PasswordCard } from '@/features/settings/components/password-card'
import { SignInMethodsCard } from '@/features/settings/components/sign-in-methods-card'
import { isDemoMode } from '@/lib/demo-mode'

/** Uncached read of the signed-in Account inside the page's Suspense boundary; anonymous visitors are redirected. */
export async function SettingsContent() {
	const { user } = await requireSession()
	if (isDemoMode()) return <DemoSettings displayName={user.displayName} />
	return (
		<>
			<DisplayNameCard displayName={user.displayName} />
			<EmailCard email={user.email} pendingEmail={user.pendingEmail} hasPassword={user.hasPassword} />
			<PasswordCard hasPassword={user.hasPassword} />
			<SignInMethodsCard hasPassword={user.hasPassword} google={user.google} />
		</>
	)
}
