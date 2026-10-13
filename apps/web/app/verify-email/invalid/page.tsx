import type { Metadata } from 'next'
import { AuthCard } from '@/components/layout/auth-card'
import { LoginLink } from '@/features/auth/login-link'
import { ResendVerification } from '@/features/auth/resend-verification'

export const metadata: Metadata = { title: 'Verification link expired' }

export default function InvalidVerificationLinkPage() {
	return (
		<AuthCard titleId="invalid-link-title" title="This link has expired or was already used" description="Enter your email and we will send you a new verification link. If you already verified it, log in.">
			<ResendVerification />
			<LoginLink />
		</AuthCard>
	)
}
