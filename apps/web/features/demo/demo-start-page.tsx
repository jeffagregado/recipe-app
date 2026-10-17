import { Suspense } from 'react'
import { AuthCard } from '@/components/layout/auth-card'
import { Skeleton } from '@/components/ui/skeleton'
import { DemoStartActions } from './demo-start-actions'

/** The demo site's home page, in place of the landing page: one button, no sign-up. */
export function DemoStartPage() {
	return (
		<AuthCard titleId="demo-start-title" title="Try Recapp" description="Explore a recipe collection that is already full of sample recipes. No email or password needed: your demo is private to you and lasts 24 hours.">
			{/* Waits for the session check, so Start demo never replaces a demo the visitor still has. */}
			<Suspense fallback={<div><Skeleton className="h-11 w-full rounded-lg" /><p role="status" className="sr-only">Checking for your demo…</p></div>}>
				<DemoStartActions />
			</Suspense>
		</AuthCard>
	)
}
