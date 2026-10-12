import { describe, expect, it } from 'vitest'

import { isActiveNavigation, navigationItems } from './navigation'

describe('navigationItems', () => {
	it('lists the four destinations in the sidebar order with the tab bar short label on Create only', () => {
		expect(navigationItems.map(({ label, shortLabel, href }) => ({ label, shortLabel, href }))).toEqual([
			{ label: 'Recipes', shortLabel: undefined, href: '/recipes' },
			{ label: 'Create Recipe', shortLabel: 'Create', href: '/recipes/create' },
			{ label: 'Categories', shortLabel: undefined, href: '/categories' },
			{ label: 'Settings', shortLabel: undefined, href: '/settings' },
		])
	})
})

describe('isActiveNavigation', () => {
	it.each([
		['/recipes', ['Recipes']],
		['/recipes/abc', []],
		['/recipes/abc/edit', []],
		['/recipes/create', ['Create Recipe']],
		['/categories', ['Categories']],
		['/categories/x', ['Categories']],
		['/settings', ['Settings']],
	])('%s marks %j as current', (pathname, expected) => {
		const active = navigationItems.filter((item) => isActiveNavigation(pathname, item.href)).map((item) => item.label)
		expect(active).toEqual(expected)
	})
})
