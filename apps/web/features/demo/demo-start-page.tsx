import { Suspense } from 'react'
import { AuthCard } from '@/components/layout/auth-card'
import { ContinueDemo } from './continue-demo'
import { StartDemoButton } from './start-demo-button'

/** The demo site's home page, in place of the landing page: one button, no sign-up. */
export function DemoStartPage() {
	return (
		<AuthCard titleId="demo-start-title" title="Try Recapp" description="Explore a recipe collection that is already full of sample recipes. No email or password needed: your demo is private to you and lasts 24 hours.">
			<div className="space-y-3">
				<StartDemoButton />
				<Suspense fallback={null}><ContinueDemo /></Suspense>
			</div>
		</AuthCard>
	)
}
