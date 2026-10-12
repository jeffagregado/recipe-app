import { requireSession } from './queries'
import { LogoutButton } from './logout-button'
import { SessionFreshness } from './session-freshness'

/** Desktop: display name, Log out and the session freshness observer. Mobile: only Log out, in the header's right slot. */
export async function ShellSession({ mobile = false }: { mobile?: boolean }) {
	const { user } = await requireSession()
	return mobile ? <LogoutButton /> : (
		<div className="space-y-3">
			<p className="min-w-0 truncate text-sm font-medium" title={user.displayName}>{user.displayName}</p>
			<LogoutButton />
			<SessionFreshness userId={user.id} />
		</div>
	)
}
