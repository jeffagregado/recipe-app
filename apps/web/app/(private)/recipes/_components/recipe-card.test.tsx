import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import type { DeleteResult, FavoriteResult } from '@/features/recipes/actions/results'
import { toRecipeCard } from '../_lib/recipe-card-data'
import { RecipeCard } from './recipe-card'

const action = vi.hoisted(() => ({ setFavorite: vi.fn<(id: string, favorite: boolean) => Promise<FavoriteResult>>() }))
vi.mock('@/features/recipes/actions/favorite', () => action)
const remove = vi.hoisted(() => ({ deleteRecipe: vi.fn<(id: string) => Promise<DeleteResult>>() }))
vi.mock('@/features/recipes/actions/delete', () => remove)

// The favorite state is shared by recipe id for the whole session, so each test uses its own recipe.
let counter = 0
let id = ''
beforeEach(() => {
	action.setFavorite.mockReset()
	action.setFavorite.mockResolvedValue({ ok: true })
	remove.deleteRecipe.mockReset()
	id = `card-${++counter}`
})

const item = (isFavorite: boolean) => ({
	id, title: 'Tomato Soup', categories: [{ id: 'category-dinner', name: 'Dinner' }], description: null, imageUrl: null, servings: null,
	prepTimeMinutes: null, cookTimeMinutes: null, createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', isFavorite,
})
const renderCard = (isFavorite: boolean) => render(<AppToaster><RecipeCard recipe={toRecipeCard(item(isFavorite))} /></AppToaster>)
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByRole('button', { name: 'More options for Tomato Soup' }))
	return screen.findByRole('menu')
}

it('renders the saved favorite state from the list data on the heart', () => {
	renderCard(true)
	expect(screen.getByRole('button', { name: 'Remove Tomato Soup from favorites' })).toHaveAttribute('aria-pressed', 'true')
})

it('renders an unsaved recipe as not a favorite', () => {
	renderCard(false)
	expect(screen.getByRole('button', { name: 'Add Tomato Soup to favorites' })).toHaveAttribute('aria-pressed', 'false')
})

it('saves through the heart', async () => {
	const user = userEvent.setup()
	renderCard(true)
	await user.click(screen.getByRole('button', { name: 'Remove Tomato Soup from favorites' }))
	expect(action.setFavorite).toHaveBeenCalledWith(id, false)
	expect(await screen.findByRole('button', { name: 'Add Tomato Soup to favorites' })).toHaveAttribute('aria-pressed', 'false')
})

it('puts the heart back and reports the problem when the save fails', async () => {
	const user = userEvent.setup()
	action.setFavorite.mockResolvedValue({ ok: false, reason: 'failed' })
	renderCard(false)
	await user.click(screen.getByRole('button', { name: 'Add Tomato Soup to favorites' }))
	expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save favorite. Try again.')
	await waitFor(() => expect(screen.getByRole('button', { name: 'Add Tomato Soup to favorites' })).toHaveAttribute('aria-pressed', 'false'))
})

it('offers the same menu as the recipe page: Edit recipe and Delete recipe, and nothing else', async () => {
	const user = userEvent.setup()
	renderCard(false)
	const menu = await openMenu(user)
	expect(within(menu).getAllByRole('menuitem').map((entry) => entry.textContent)).toEqual(['Edit recipe', 'Delete recipe'])
	expect(within(menu).getByRole('menuitem', { name: 'Edit recipe' })).toHaveAttribute('href', `/recipes/${id}/edit`)
})

it('deletes this card’s recipe only after the confirmation', async () => {
	const user = userEvent.setup()
	remove.deleteRecipe.mockResolvedValue({ ok: false, reason: 'failed' })
	renderCard(false)
	await openMenu(user)
	await user.click(screen.getByRole('menuitem', { name: 'Delete recipe' }))
	const dialog = await screen.findByRole('alertdialog', { name: 'Delete recipe?' })
	expect(dialog).toHaveTextContent('“Tomato Soup” and its photos will be permanently deleted.')
	expect(remove.deleteRecipe).not.toHaveBeenCalled()
	await user.click(within(dialog).getByRole('button', { name: 'Delete recipe' }))
	await waitFor(() => expect(remove.deleteRecipe).toHaveBeenCalledWith(id))
})
