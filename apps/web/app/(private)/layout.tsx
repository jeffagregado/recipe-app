import Sidebar from '@/components/layout/sidebar'
import { Suspense, type ReactNode } from 'react'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { ShellSession } from '@/features/auth/shell-session'

type PrivateLayoutProps = {
	children: ReactNode
}

export default function PrivateLayout({ children }: PrivateLayoutProps) {
	return (
		<div data-private-content className="flex min-h-dvh bg-muted/30">
			<Suspense fallback={<aside aria-label="Loading navigation" className="hidden h-dvh w-55 shrink-0 border-r border-neutral-200 bg-sidebar lg:sticky lg:top-0 lg:block" />}>
				<Sidebar footer={<SessionErrorBoundary><Suspense fallback={<p role="status">Checking session...</p>}><ShellSession /></Suspense></SessionErrorBoundary>} />
			</Suspense>

			<div className="min-w-0 flex-1">
				<header className="border-b border-border bg-sidebar px-4 py-3 lg:hidden">
					<SessionErrorBoundary><Suspense fallback={<p role="status">Checking session...</p>}><ShellSession mobile /></Suspense></SessionErrorBoundary>
				</header>
				<main className="min-w-0 pb-20 lg:pb-0">{children}</main>
			</div>
		</div>
	)
}
