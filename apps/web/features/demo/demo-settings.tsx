import { useId } from 'react'
import { DisplayNameCard } from '@/features/settings/components/display-name-card'
import { SettingsSection } from '@/features/settings/components/settings-section'

/** A setting that needs email, a password or Google, none of which a Demo account has. */
function UnavailableSetting({ title, description }: { title: string; description: string }) {
	const headingId = useId()
	return (
		<SettingsSection headingId={headingId} title={title} description={description}>
			<p className="flex min-h-11 items-center text-sm text-muted-foreground">Not available in the demo</p>
		</SettingsSection>
	)
}

/** Settings on the demo site: the display name stays editable; the sign-in settings are shown but inactive. */
export function DemoSettings({ displayName }: { displayName: string }) {
	return (
		<>
			<DisplayNameCard displayName={displayName} />
			<UnavailableSetting title="Email" description="Sign-in and recovery address." />
			<UnavailableSetting title="Password" description="Signs you in with your email." />
			<UnavailableSetting title="Sign-in methods" description="Google and email sign-in." />
		</>
	)
}
