import Sidebar from '@/components/layout/sidebar'
import type { ReactNode } from 'react'

type PrivateLayoutProps = {
	children: ReactNode
}

export default function PrivateLayout({ children }: PrivateLayoutProps) {
	return (
		<div className="flex min-h-dvh bg-muted/30">
			<Sidebar />

			{/* <main className="min-w-0 flex-1">{children}</main> */}
			<main className="pb-20 lg:pb-0 min-w-0 flex-1">{children}</main>
		</div>
	)
}
