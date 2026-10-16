import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AppToaster } from '@/components/layout/app-toaster'
import { AuthCard } from '@/components/layout/auth-card'
import { NoticeToast } from '@/components/layout/notice-toast'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { HomeSession } from './_components/home-session'

export const metadata: Metadata = { title: 'Log in' }

export default function LoginPage() {
	return (
		<AppToaster>
			<AuthCard titleId="login-title" title="Log in" description="Log in or sign up to open your recipe collection.">
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
