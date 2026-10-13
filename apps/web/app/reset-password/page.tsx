import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthCard } from '@/components/layout/auth-card'
import { ResetPasswordForm } from '@/features/auth/reset-password-form'

export const metadata: Metadata = { title: 'Choose a new password', referrer: 'no-referrer' }

type ResetPasswordPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

async function ResetForm({ searchParams }: ResetPasswordPageProps) {
	const { token } = await searchParams
	return <ResetPasswordForm token={typeof token === 'string' ? token : undefined} />
}

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
	return (
		<AuthCard titleId="reset-password-title" title="Choose a new password" description="Choose a password you have not used before.">
			<Suspense fallback={<p role="status" className="text-sm text-muted-foreground wrap-break-word">Loading your link...</p>}>
				<ResetForm searchParams={searchParams} />
			</Suspense>
		</AuthCard>
	)
}
