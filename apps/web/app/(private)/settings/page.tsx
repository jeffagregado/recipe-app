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
			{/* One row per setting, each saving alone; later rows stack below the first. */}
			<PageContainer className="pb-8">
				<SessionErrorBoundary>
					<Suspense fallback={<SettingsLoading />}>
						<SettingsContent />
					</Suspense>
				</SessionErrorBoundary>
			</PageContainer>
		</>
	)
}
