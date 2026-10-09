import { requireSession } from './queries'
import { LogoutButton } from './logout-button'
import { SessionFreshness } from './session-freshness'

export async function ShellSession({ mobile = false }: { mobile?: boolean }) {
	const { user } = await requireSession()
	return <div className={mobile ? 'flex min-w-0 items-center justify-between gap-3' : 'space-y-3'}>
		<p className="min-w-0 truncate text-sm font-medium" title={user.displayName}>{user.displayName}</p>
		<LogoutButton />
		{!mobile && <SessionFreshness userId={user.id} />}
	</div>
}
