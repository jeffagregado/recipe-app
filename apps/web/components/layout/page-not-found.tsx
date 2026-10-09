'use client'

import { Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import PageContainer from '@/components/layout/page-container'

const REDIRECT_DELAY_MS = 5_000
const DESTINATION = '/recipes'

/** "Page not found" that sends the user to Recipes after five seconds; "Go now" skips the wait. */
export function PageNotFound() {
	const router = useRouter()
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

	// Cleanup also covers the page being hidden or left, so a stale timer never redirects someone who moved on.
	useEffect(() => {
		timer.current = setTimeout(() => router.replace(DESTINATION), REDIRECT_DELAY_MS)
		return () => clearTimeout(timer.current)
	}, [router])

	return (
		<PageContainer>
			<div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
				<span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
					<Search className="size-5" />
				</span>
				<div className="min-w-0 space-y-1">
					<h1 className="text-lg font-semibold">Page not found</h1>
					<p className="text-sm text-muted-foreground">
						{/* A static sentence in a status region: announced once, never every second. */}
						<span role="status">Taking you to Recipes in 5 seconds.</span>{' '}
						<Link href={DESTINATION} onClick={() => clearTimeout(timer.current)} className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">
							Go now
						</Link>
					</p>
				</div>
			</div>
		</PageContainer>
	)
}
