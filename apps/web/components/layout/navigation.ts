import { BookOpen, Folder, Plus, Settings, type LucideIcon } from 'lucide-react'

export type NavigationItem = {
	label: string
	/** Shown by the bottom tab bar when the full label would not fit four across. */
	shortLabel?: string
	href: string
	icon: LucideIcon
}

/** The four private destinations, in the order both the sidebar and the mobile tab bar show them. */
export const navigationItems: NavigationItem[] = [
	{
		label: 'Recipes',
		href: '/recipes',
		icon: BookOpen,
	},
	{
		label: 'Create Recipe',
		shortLabel: 'Create',
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

/** Recipes is current only on the list itself; every other destination is current on its own path and below. */
export function isActiveNavigation(pathname: string, href: string): boolean {
	if (href === '/recipes') return pathname === '/recipes'

	return pathname.startsWith(href)
}
