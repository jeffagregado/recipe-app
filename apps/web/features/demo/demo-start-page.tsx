import Link from 'next/link'
import { Suspense } from 'react'
import { AuthCard } from '@/components/layout/auth-card'
import { buttonVariants } from '@/components/ui/button'
import { getSession } from '@/features/auth/queries'
import { cn } from '@/lib/utils'
import { StartDemoButton } from './start-demo-button'

/** A visitor still signed in to a Demo account gets it back. A failed session read hides the link and leaves Start demo working. */
export async function ContinueDemo() {
	const session = await getSession().catch(() => null)
	if (session?.status !== 'authenticated') return null
	return <Link href="/recipes" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full text-base')}>Continue your demo</Link>
}

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
