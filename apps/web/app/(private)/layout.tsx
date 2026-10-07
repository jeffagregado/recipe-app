import Sidebar from '@/components/layout/sidebar'
import { Suspense, type ReactNode } from 'react'

type PrivateLayoutProps = {
	children: ReactNode
}

export default function PrivateLayout({ children }: PrivateLayoutProps) {
	return (
		<div className="flex min-h-dvh bg-muted/30">
			<Suspense fallback={<aside aria-label="Loading navigation" className="hidden h-dvh w-55 shrink-0 border-r border-neutral-200 bg-sidebar lg:sticky lg:top-0 lg:block" />}>
				<Sidebar />
			</Suspense>

			{/* <main className="min-w-0 flex-1">{children}</main> */}
			<main className="pb-20 lg:pb-0 min-w-0 flex-1">{children}</main>
		</div>
	)
}
