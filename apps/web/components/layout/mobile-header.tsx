import type { ReactNode } from 'react'
import { Brand } from './brand'

/** The top bar below `lg`: the brand block on the left and the session's Log out button on the right. Not sticky. */
export function MobileHeader({ session }: { session: ReactNode }) {
	return (
		<header className="flex items-center justify-between gap-3 border-b border-border bg-sidebar px-4 py-3 lg:hidden">
			<Brand />
			{session}
		</header>
	)
}
