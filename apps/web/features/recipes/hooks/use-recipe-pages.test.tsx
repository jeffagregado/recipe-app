import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RecipeFilters } from '@recipe-app/contracts/types'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import { FavoriteButton } from '../components/favorite-button'
import { useRecipePages } from './use-recipe-pages'

const api = vi.hoisted(() => ({ fetchRecipePage: vi.fn(), RECIPE_PAGE_SIZE: 20 }))
vi.mock('../api/request', () => api)
const action = vi.hoisted(() => ({ setFavorite: vi.fn() }))
vi.mock('../actions/favorite', () => action)

const sorting = { sortBy: 'createdAt', order: 'desc' } as const
const page = { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 }, counts: { total: 0, categories: {} } }

function Pages({ filters }: { filters: RecipeFilters }) {
	const { query } = useRecipePages('user-1', '/backend/recipes', filters)
	return <p>{query.isFetching ? 'loading' : 'loaded'}</p>
}

// The favorite state is shared by recipe id for the whole session, so each test uses its own recipe.
let counter = 0
async function removeFavorite(filters: RecipeFilters) {
	render(<QueryClientProvider client={new QueryClient()}><AppToaster>
		<Pages filters={filters} />
		<FavoriteButton recipeId={`listed-${++counter}`} title="Tomato Soup" isFavorite />
	</AppToaster></QueryClientProvider>)
	await screen.findByText('loaded')
	await userEvent.setup().click(screen.getByRole('button', { name: 'Remove Tomato Soup from favorites' }))
}

beforeEach(() => {
	api.fetchRecipePage.mockReset().mockResolvedValue(page)
	action.setFavorite.mockReset().mockResolvedValue({ ok: true })
})

it('reloads the favorites list once a favorite change is confirmed', async () => {
	await removeFavorite({ ...sorting, favorites: true })
	await waitFor(() => expect(api.fetchRecipePage).toHaveBeenCalledTimes(2))
})

it('keeps the favorites list as loaded when the change fails', async () => {
	action.setFavorite.mockResolvedValue({ ok: false, reason: 'failed' })
	await removeFavorite({ ...sorting, favorites: true })
	await screen.findByRole('alert')
	expect(api.fetchRecipePage).toHaveBeenCalledTimes(1)
})

it('leaves lists that do not depend on favorites alone', async () => {
	await removeFavorite(sorting)
	await waitFor(() => expect(action.setFavorite).toHaveBeenCalled())
	await screen.findByText('loaded')
	expect(api.fetchRecipePage).toHaveBeenCalledTimes(1)
})
