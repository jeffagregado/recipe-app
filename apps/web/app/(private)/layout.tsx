import Sidebar from '@/components/layout/sidebar'
import { Suspense, type ReactNode } from 'react'
import { AppToaster } from '@/components/layout/app-toaster'
import { MobileHeader } from '@/components/layout/mobile-header'
import { MobileNav, MobileNavPlaceholder } from '@/components/layout/mobile-nav'
import { NoticeToast } from '@/components/layout/notice-toast'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { ShellSession } from '@/features/auth/shell-session'
import { DemoBanner } from '@/features/demo/demo-banner'
import { DemoModeProvider } from '@/features/demo/demo-mode-context'
import { isDemoMode } from '@/lib/demo-mode'

type PrivateLayoutProps = {
	children: ReactNode
}

export default function PrivateLayout({ children }: PrivateLayoutProps) {
	return (
		<AppToaster>
			<div data-private-content className="flex min-h-dvh bg-muted/30">
				<Suspense fallback={<aside aria-label="Loading navigation" className="hidden h-dvh w-56 shrink-0 border-r border-sidebar-border bg-sidebar lg:sticky lg:top-0 lg:block" />}>
					<Sidebar footer={<SessionErrorBoundary><Suspense fallback={<p role="status">Checking session...</p>}><ShellSession /></Suspense></SessionErrorBoundary>} />
				</Suspense>

				<div className="min-w-0 flex-1">
					{isDemoMode() && <DemoBanner />}
					<MobileHeader session={<SessionErrorBoundary><Suspense fallback={<p role="status">Checking session...</p>}><ShellSession mobile /></Suspense></SessionErrorBoundary>} />
					{/* The bottom padding keeps content clear of the fixed tab bar below lg. */}
					<main className="min-w-0 pb-20 lg:pb-0"><DemoModeProvider enabled={isDemoMode()}>{children}</DemoModeProvider></main>
				</div>
			</div>
			{/* Reads the pathname, so like the sidebar it streams in behind a same-size placeholder. */}
			<Suspense fallback={<MobileNavPlaceholder />}>
				<MobileNav />
			</Suspense>
			{/* Reads the search params, so it suspends on its own and never delays the shell. */}
			<Suspense fallback={null}>
				<NoticeToast />
			</Suspense>
		</AppToaster>
	)
}
