import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import type { FavoriteResult } from '@/features/recipes/actions/results'
import { toRecipeCard } from '../_lib/recipe-card-data'
import { RecipeCard } from './recipe-card'

const action = vi.hoisted(() => ({ setFavorite: vi.fn<(id: string, favorite: boolean) => Promise<FavoriteResult>>() }))
vi.mock('@/features/recipes/actions/favorite', () => action)

// The favorite state is shared by recipe id for the whole session, so each test uses its own recipe.
let counter = 0
let id = ''
beforeEach(() => {
	action.setFavorite.mockReset()
	action.setFavorite.mockResolvedValue({ ok: true })
	id = `card-${++counter}`
})

const item = (isFavorite: boolean) => ({
	id, title: 'Tomato Soup', categories: ['Dinner' as const], description: null, imageUrl: null, servings: null,
	prepTimeMinutes: null, cookTimeMinutes: null, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', isFavorite,
})
const renderCard = (isFavorite: boolean) => render(<AppToaster><RecipeCard recipe={toRecipeCard(item(isFavorite))} /></AppToaster>)
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByRole('button', { name: 'More options for Tomato Soup' }))
	return screen.findByRole('menu')
}

it('renders the saved favorite state from the list data on the heart and in the menu', async () => {
	const user = userEvent.setup()
	renderCard(true)
	expect(screen.getByRole('button', { name: 'Remove Tomato Soup from favorites' })).toHaveAttribute('aria-pressed', 'true')
	await openMenu(user)
	expect(screen.getByRole('menuitem', { name: 'Remove from favorites' })).toBeInTheDocument()
})

it('renders an unsaved recipe as not a favorite', async () => {
	const user = userEvent.setup()
	renderCard(false)
	expect(screen.getByRole('button', { name: 'Add Tomato Soup to favorites' })).toHaveAttribute('aria-pressed', 'false')
	await openMenu(user)
	expect(screen.getByRole('menuitem', { name: 'Add to favorites' })).toBeInTheDocument()
})

it('saves through the menu item and the heart then agrees', async () => {
	const user = userEvent.setup()
	renderCard(false)
	await openMenu(user)
	await user.click(screen.getByRole('menuitem', { name: 'Add to favorites' }))

	expect(action.setFavorite).toHaveBeenCalledWith(id, true)
	expect(await screen.findByRole('button', { name: 'Remove Tomato Soup from favorites' })).toHaveAttribute('aria-pressed', 'true')
	await openMenu(user)
	expect(screen.getByRole('menuitem', { name: 'Remove from favorites' })).toBeInTheDocument()
})

it('saves through the heart and the menu item then agrees', async () => {
	const user = userEvent.setup()
	renderCard(true)
	await user.click(screen.getByRole('button', { name: 'Remove Tomato Soup from favorites' }))
	expect(action.setFavorite).toHaveBeenCalledWith(id, false)
	await openMenu(user)
	expect(screen.getByRole('menuitem', { name: 'Add to favorites' })).toBeInTheDocument()
})

it('puts both back and reports the problem when the save fails', async () => {
	const user = userEvent.setup()
	action.setFavorite.mockResolvedValue({ ok: false, reason: 'failed' })
	renderCard(false)
	await user.click(screen.getByRole('button', { name: 'Add Tomato Soup to favorites' }))
	expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save favorite. Try again.')
	await waitFor(() => expect(screen.getByRole('button', { name: 'Add Tomato Soup to favorites' })).toHaveAttribute('aria-pressed', 'false'))
	await openMenu(user)
	expect(screen.getByRole('menuitem', { name: 'Add to favorites' })).toBeInTheDocument()
})
