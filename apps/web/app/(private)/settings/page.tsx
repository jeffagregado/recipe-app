import type { Metadata } from 'next'
import { Suspense } from 'react'
import PageContainer from '@/components/layout/page-container'
import { SessionErrorBoundary } from '@/features/auth/session-error'
import { SettingsContent } from './_components/settings-content'
import { SettingsHeader } from './_components/settings-header'
import { SettingsLoading } from './_components/settings-loading'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage() {
	return (
		<>
			<SettingsHeader />
			{/* One card per setting, each saving alone; later cards stack below the first. */}
			<PageContainer className="space-y-4 pb-8 sm:space-y-5">
				<SessionErrorBoundary>
					<Suspense fallback={<SettingsLoading />}>
						<SettingsContent />
					</Suspense>
				</SessionErrorBoundary>
			</PageContainer>
		</>
	)
}
