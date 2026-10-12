'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isActiveNavigation, navigationItems, type NavigationItem } from './navigation'

const shellClassName = 'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-sidebar pt-2 pb-[env(safe-area-inset-bottom)] lg:hidden'

/** The bar's box while the tab bar streams in: same place and size, no landmark and nothing to announce. */
export function MobileNavPlaceholder() {
	return (
		<div aria-hidden="true" className={shellClassName}>
			<div className="h-14" />
		</div>
	)
}

/** The bottom tab bar below `lg`: the sidebar's destinations, order, icons and active styling in a fixed bar above the safe area. */
export function MobileNav() {
	const pathname = usePathname()

	return (
		<nav aria-label="Main" className={shellClassName}>
			<ul className="flex px-2">
				{navigationItems.map((item) => (
					<li key={item.href} className="min-w-0 flex-1">
						<MobileNavItem item={item} active={isActiveNavigation(pathname, item.href)} />
					</li>
				))}
			</ul>
		</nav>
	)
}

type MobileNavItemProps = {
	item: NavigationItem
	active: boolean
}

function MobileNavItem({ item, active }: MobileNavItemProps) {
	const Icon = item.icon

	return (
		<Link
			href={item.href}
			aria-current={active ? 'page' : undefined}
			className={[
				'flex h-14 flex-col items-center justify-center gap-1 rounded-lg',
				'text-[11px] font-medium transition-colors',
				'focus-visible:outline-none focus-visible:ring-2',
				'focus-visible:ring-green-800 focus-visible:ring-offset-1',
				active ? 'bg-sidebar-accent text-[#1f3b1f]' : 'text-neutral-700',
			].join(' ')}
		>
			<Icon size={22} strokeWidth={1.8} className={active ? 'text-[#315c32]' : 'text-neutral-600'} />

			<span className="truncate">{item.shortLabel ?? item.label}</span>
		</Link>
	)
}
