'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { Brand } from './brand'
import { isActiveNavigation, navigationItems, type NavigationItem } from './navigation'

export default function Sidebar({ footer }: { footer?: ReactNode }) {
	const pathname = usePathname()

	return (
		<aside className="hidden h-dvh w-56 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:flex-col">
			<div className="px-5 py-6">
				<Brand />
			</div>
			<nav className="flex flex-1 flex-col gap-1 px-3">
				{navigationItems.map((item) => (
					<SidebarItem key={item.href} item={item} active={isActiveNavigation(pathname, item.href)} />
				))}
			</nav>
			<div className="border-t border-sidebar-border px-5 py-4">{footer}</div>
		</aside>
	)
}

type SidebarItemProps = {
	item: NavigationItem
	active: boolean
}

function SidebarItem({ item, active }: SidebarItemProps) {
	const Icon = item.icon

	return (
		<Link
			href={item.href}
			aria-current={active ? 'page' : undefined}
			className={[
				'group flex h-11 items-center gap-3 rounded-lg px-3',
				'text-sm font-medium transition-colors motion-safe:active:scale-[0.98]',
				'focus-visible:outline-none focus-visible:ring-2',
				'focus-visible:ring-sidebar-ring focus-visible:ring-offset-1',
				active
					? 'bg-sidebar-accent text-sidebar-accent-foreground'
					: 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
			].join(' ')}
		>
			<Icon
				size={18}
				strokeWidth={1.8}
				className={active ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-primary'}
			/>

			<span>{item.label}</span>
		</Link>
	)
}
