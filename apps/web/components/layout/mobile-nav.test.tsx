import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'

const navigation = vi.hoisted(() => ({ pathname: '/recipes' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

import { MobileNav } from './mobile-nav'

const links = () => screen.getByRole('navigation', { name: 'Main' }).querySelectorAll('a')

it('is the Main navigation with the four destinations in the sidebar order under their short labels', () => {
	render(<MobileNav />)
	expect(Array.from(links()).map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
		['Recipes', '/recipes'],
		['Create', '/recipes/create'],
		['Categories', '/categories'],
		['Settings', '/settings'],
	])
})

it('marks only the current destination as the current page', () => {
	navigation.pathname = '/categories/breakfast'
	render(<MobileNav />)
	expect(screen.getByRole('link', { name: 'Categories' })).toHaveAttribute('aria-current', 'page')
	expect(screen.getAllByRole('link').filter((link) => link.hasAttribute('aria-current'))).toHaveLength(1)
})

it('moves focus through the four links in order with Tab', async () => {
	const user = userEvent.setup()
	render(<MobileNav />)
	for (const name of ['Recipes', 'Create', 'Categories', 'Settings']) {
		await user.tab()
		expect(screen.getByRole('link', { name })).toHaveFocus()
	}
})
