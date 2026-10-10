import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RecipeFilters } from '@recipe-app/contracts/types'
import { expect, it, vi } from 'vitest'
import { RecipeControls } from './recipe-controls'

const sorting = { sortBy: 'createdAt', order: 'desc' } as const
const counts = { total: 7, categories: { Breakfast: 1, Lunch: 2, Dinner: 3, Snacks: 0, Desserts: 1 } }

function renderControls(filters: Partial<RecipeFilters> = {}) {
	const onFilter = vi.fn()
	render(<RecipeControls filters={{ ...sorting, ...filters }} counts={counts} loading={false} onFilter={onFilter} onSort={vi.fn()} />)
	const chips = within(screen.getByRole('group', { name: 'Recipe categories' }))
	return { onFilter, chips, pressed: () => chips.getAllByRole('button', { pressed: true }).map((chip) => chip.textContent) }
}

it('places Favorites right after All, ahead of the categories', () => {
	const { chips } = renderControls()
	expect(chips.getAllByRole('button').map((chip) => chip.textContent)).toEqual(['All7', 'Favorites', 'Breakfast1', 'Lunch2', 'Dinner3', 'Snacks0', 'Desserts1'])
})

it.each([
	[{}, ['All7']],
	[{ favorites: true }, ['Favorites']],
	[{ category: 'Dinner' }, ['Dinner3']],
] as const)('marks the chip for %j as the pressed one', (filters, expected) => {
	expect(renderControls(filters).pressed()).toEqual(expected)
})

it.each([
	['Favorites', { category: 'Dinner' }, { favorites: true }],
	['Dinner', { favorites: true }, { category: 'Dinner' }],
	['All', { favorites: true }, {}],
] as const)('choosing %s replaces the current chip instead of adding to it', async (name, filters, choice) => {
	const { onFilter, chips } = renderControls(filters)
	await userEvent.setup().click(chips.getByRole('button', { name: new RegExp(`^${name}`) }))
	expect(onFilter).toHaveBeenCalledExactlyOnceWith(choice)
})
