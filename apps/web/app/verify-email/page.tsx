import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthCard } from '@/components/layout/auth-card'
import { VerifyEmailForm } from '@/features/auth/verify-email-form'

export const metadata: Metadata = { title: 'Verify your email', referrer: 'no-referrer' }

type VerifyEmailPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

async function VerifyForm({ searchParams }: VerifyEmailPageProps) {
	const { token } = await searchParams
	return <VerifyEmailForm token={typeof token === 'string' ? token : undefined} />
}

/** The link in the verification email points here, on the web origin, and never at the API. Opening it verifies nothing. */
export default function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
	return (
		<AuthCard titleId="verify-email-title" title="Verify your email" description="Press the button to finish verifying your email. Then log in.">
			<Suspense fallback={<p role="status" className="text-sm text-muted-foreground wrap-break-word">Loading your link...</p>}>
				<VerifyForm searchParams={searchParams} />
			</Suspense>
		</AuthCard>
	)
}
