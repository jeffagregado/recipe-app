import type { Metadata } from 'next'
import { AuthCard } from '@/components/layout/auth-card'
import { ForgotPasswordForm } from '@/features/auth/forgot-password-form'
import { LoginLink } from '@/features/auth/login-link'

export const metadata: Metadata = { title: 'Forgot your password?' }

export default function ForgotPasswordPage() {
	return (
		<AuthCard titleId="forgot-password-title" title="Forgot your password?" description="Enter your email and we will send you a link to reset your password.">
			<ForgotPasswordForm />
			<LoginLink />
		</AuthCard>
	)
}
