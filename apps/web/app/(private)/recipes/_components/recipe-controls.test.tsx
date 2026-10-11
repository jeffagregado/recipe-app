import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RecipeFilters } from '@recipe-app/contracts/types'
import { expect, it, vi } from 'vitest'
import { RecipeControls } from './recipe-controls'

const sorting = { sortBy: 'createdAt', order: 'desc' } as const
const categories = [
	{ id: 'category-breakfast', name: 'Breakfast' },
	{ id: 'category-lunch', name: 'Lunch' },
	{ id: 'category-dinner', name: 'Dinner' },
	{ id: 'category-snacks', name: 'Snacks' },
	{ id: 'category-desserts', name: 'Desserts' },
]
const counts = { total: 7, favorites: 2, categories: categories.map((category, index) => ({ ...category, total: [1, 2, 3, 0, 1][index] })).reverse() }

function renderControls(filters: Partial<RecipeFilters> = {}, availableCategories = categories) {
	const onFilter = vi.fn()
	render(<RecipeControls categories={availableCategories} filters={{ ...sorting, ...filters }} counts={counts} loading={false} onFilter={onFilter} onSort={vi.fn()} />)
	const chips = within(screen.getByRole('group', { name: 'Recipe categories' }))
	return { onFilter, chips, pressed: () => chips.getAllByRole('button', { pressed: true }).map((chip) => chip.textContent) }
}

it('places Favorites right after All, then categories in supplied order with id-keyed totals', () => {
	const { chips } = renderControls()
	expect(chips.getAllByRole('button').map((chip) => chip.textContent)).toEqual(['All7', 'Favorites2', 'Breakfast1', 'Lunch2', 'Dinner3', 'Snacks0', 'Desserts1'])
})

it.each([
	[{}, ['All7']],
	[{ favorites: true }, ['Favorites2']],
	[{ category: 'category-dinner' }, ['Dinner3']],
] as const)('marks the chip for %j as the pressed one', (filters, expected) => {
	expect(renderControls(filters).pressed()).toEqual(expected)
})

it.each([
	['Favorites', { category: 'category-dinner' }, { favorites: true }],
	['Dinner', { favorites: true }, { category: 'category-dinner' }],
	['All', { favorites: true }, {}],
] as const)('choosing %s replaces the current chip instead of adding to it', async (name, filters, choice) => {
	const { onFilter, chips } = renderControls(filters)
	await userEvent.setup().click(chips.getByRole('button', { name: new RegExp(`^${name}`) }))
	expect(onFilter).toHaveBeenCalledExactlyOnceWith(choice)
})

it('treats a category named All as its own id-based choice', async () => {
	const { chips, onFilter } = renderControls({}, [{ id: 'category-dinner', name: 'All' }])
	const buttons = chips.getAllByRole('button')
	expect(buttons.map((chip) => chip.textContent)).toEqual(['All7', 'Favorites2', 'All3'])
	await userEvent.setup().click(buttons[2])
	expect(onFilter).toHaveBeenCalledExactlyOnceWith({ category: 'category-dinner' })
})

it('renders only All and Favorites without categories', () => {
	const { chips } = renderControls({}, [])
	expect(chips.getAllByRole('button').map((chip) => chip.textContent)).toEqual(['All7', 'Favorites2'])
})
