import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AuthCard } from '@/components/layout/auth-card'
import { ConfirmEmailChangeForm } from '@/features/settings/components/confirm-email-change-form'

export const metadata: Metadata = { title: 'Confirm your new email', referrer: 'no-referrer' }

type ConfirmEmailChangePageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

async function ConfirmForm({ searchParams }: ConfirmEmailChangePageProps) {
	const { token } = await searchParams
	return <ConfirmEmailChangeForm token={typeof token === 'string' ? token : undefined} />
}

/** The link in the email-change mail points here, on the web origin, and never at the API. Opening it changes nothing. */
export default function ConfirmEmailChangePage({ searchParams }: ConfirmEmailChangePageProps) {
	return (
		<AuthCard titleId="confirm-email-change-title" title="Confirm your new email" description="Your account switches to this address when you confirm. Your other devices are signed out.">
			<Suspense fallback={<p role="status" className="text-sm text-muted-foreground wrap-break-word">Loading your link...</p>}>
				<ConfirmForm searchParams={searchParams} />
			</Suspense>
		</AuthCard>
	)
}
