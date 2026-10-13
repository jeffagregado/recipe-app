import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthCard } from '@/components/layout/auth-card'
import { LoginLink } from '@/features/auth/login-link'
import { PendingVerification } from './_components/pending-verification'

export const metadata: Metadata = { title: 'Check your email' }

export default function CheckEmailPage() {
	return (
		<AuthCard titleId="check-email-title" title="Check your email" description="Open the link we sent you to verify your email. You can log in once it is verified.">
			{/* The address comes from a cookie, so it streams in behind the static card. */}
			<Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Loading your details...</p>}>
				<PendingVerification />
			</Suspense>
			<LoginLink />
		</AuthCard>
	)
}
