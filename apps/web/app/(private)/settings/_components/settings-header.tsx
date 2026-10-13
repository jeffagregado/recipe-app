'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useToastTop } from '@/components/layout/use-toast-top'
import { buttonVariants } from '@/components/ui/button'

/** Below md the header is 61px tall (8px padding each side, 44px Back, 1px border); toasts stack under it while it is mounted. */
const MOBILE_TOAST_TOP = 'calc(var(--mobile-header-height) + 61px + 1rem)'

/** Mobile: Back and the centred title in one row. From md: title and description. Sticky, like the Categories header. */
export function SettingsHeader() {
	useToastTop(MOBILE_TOAST_TOP)
	return (
		<header className="sticky top-0 z-20 border-b border-border bg-background">
			<div className="mx-auto grid w-full max-w-360 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2 sm:px-5 md:block md:py-3 lg:px-6 xl:px-8">
				<Link href="/recipes" className={buttonVariants({ variant: 'ghost', className: '-ml-2 h-11 justify-self-start px-2 md:hidden' })}>
					<ArrowLeft aria-hidden="true" /> Back
				</Link>
				<div className="min-w-0">
					<h1 className="truncate text-center text-base font-semibold md:text-left md:text-2xl md:font-bold">Settings</h1>
					<p className="hidden text-sm text-muted-foreground md:block">Your name, email, password and the ways you sign in.</p>
				</div>
			</div>
		</header>
	)
}
