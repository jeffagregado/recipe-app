import { requireSession } from '@/features/auth/queries'
import { DisplayNameCard } from '@/features/settings/components/display-name-card'
import { EmailCard } from '@/features/settings/components/email-card'
import { PasswordCard } from '@/features/settings/components/password-card'

/** Uncached read of the signed-in Account inside the page's Suspense boundary; anonymous visitors are redirected. */
export async function SettingsContent() {
	const { user } = await requireSession()
	return (
		<>
			<DisplayNameCard displayName={user.displayName} />
			<EmailCard email={user.email} pendingEmail={user.pendingEmail} hasPassword={user.hasPassword} />
			<PasswordCard hasPassword={user.hasPassword} />
		</>
	)
}
