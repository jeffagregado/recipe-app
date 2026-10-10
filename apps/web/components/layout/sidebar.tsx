'use client'

import { BookOpen, Folder, Plus, Settings, Utensils, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

type NavigationItem = {
	label: string
	href: string
	icon: LucideIcon
}

const navigationItems: NavigationItem[] = [
	{
		label: 'Recipes',
		href: '/recipes',
		icon: BookOpen,
	},
	{
		label: 'Create Recipe',
		href: '/recipes/create',
		icon: Plus,
	},
	{
		label: 'Categories',
		href: '/categories',
		icon: Folder,
	},
	{
		label: 'Settings',
		href: '/settings',
		icon: Settings,
	},
]

export default function Sidebar({ footer }: { footer?: ReactNode }) {
	const pathname = usePathname()

	const isActive = (href: string) => {
		if (href === '/recipes') return pathname === '/recipes'

		return pathname.startsWith(href)
	}
	return (
		<aside className="hidden h-dvh w-55 shrink-0 border-r border-neutral-200 bg-sidebar lg:sticky lg:top-0 lg:flex lg:flex-col ">
			<div className="px-5 py-6">
				<Brand />
			</div>
			<nav className="flex flex-1 flex-col gap-1 px-3">
				{navigationItems.map((item) => (
					<SidebarItem key={item.href} item={item} active={isActive(item.href)} />
				))}
			</nav>
			<div className="border-t border-border px-5 py-4">{footer}</div>
		</aside>
	)
}

function Brand() {
	return (
		<Link
			href="/recipes"
			className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-800 focus-visible:ring-offset-2"
		>
			<div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#526619] text-white">
				<Utensils size={18} strokeWidth={2} />
			</div>

			<div className="min-w-0">
				<p className="truncate text-[15px] font-semibold leading-5 text-neutral-950">My Recipes</p>

				<p className="mt-0.5 truncate text-[11px] leading-4 text-neutral-500">
					Private · Just for you
				</p>
			</div>
		</Link>
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
				'text-[13px] font-medium transition-colors',
				'focus-visible:outline-none focus-visible:ring-2',
				'focus-visible:ring-green-800 focus-visible:ring-offset-1',
				active
					? 'bg-sidebar-accent text-[#1f3b1f]'
					: 'text-neutral-700 hover:bg-sidebar-accent hover:text-neutral-950',
			].join(' ')}
		>
			<Icon
				size={17}
				strokeWidth={1.8}
				className={active ? 'text-[#315c32]' : 'text-neutral-600 group-hover:text-neutral-900'}
			/>

			<span>{item.label}</span>
		</Link>
	)
}
