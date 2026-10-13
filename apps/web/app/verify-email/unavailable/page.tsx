import type { Metadata } from 'next'
import { AuthCard } from '@/components/layout/auth-card'
import { LoginLink } from '@/features/auth/login-link'

export const metadata: Metadata = { title: 'Try again later' }

export default function VerificationUnavailablePage() {
	return (
		<AuthCard titleId="verification-unavailable-title" title="We could not verify your email right now" description="Your link was not used. Open it again in a few minutes.">
			<LoginLink />
		</AuthCard>
	)
}
