import { Suspense } from 'react'
import { AppToaster } from '@/components/layout/app-toaster'
import { AuthCard } from '@/components/layout/auth-card'
import { NoticeToast } from '@/components/layout/notice-toast'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { HomeSession } from './_components/home-session'

export default function HomePage() {
	return (
		<AppToaster>
			<AuthCard titleId="home-title" title="My Recipes" description="Your recipes, all in one place. A private kitchen collection, just for you.">
				<SessionErrorBoundary>
					<Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Checking your session...</p>}><HomeSession /></Suspense>
				</SessionErrorBoundary>
			</AuthCard>
			{/* Shows the notice a redirect carries here, such as a verified email. It reads the search params, so it suspends on its own. */}
			<Suspense fallback={null}>
				<NoticeToast />
			</Suspense>
		</AppToaster>
	)
}
