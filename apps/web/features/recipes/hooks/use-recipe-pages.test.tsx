import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RecipeFilters } from '@recipe-app/contracts/types'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import { FavoriteButton } from '../components/favorite-button'
import { useRecipePages } from './use-recipe-pages'

const api = vi.hoisted(() => ({ fetchRecipePage: vi.fn(), RECIPE_PAGE_SIZE: 20 }))
vi.mock('../api/request', () => api)
const action = vi.hoisted(() => ({ setFavorite: vi.fn() }))
vi.mock('../actions/favorite', () => action)

const sorting = { sortBy: 'createdAt', order: 'desc' } as const
const favoritesOnly = { ...sorting, favorites: true } as const
const listPage = (favorites: number, page = 1, totalPages = 1) => ({
	data: [], meta: { page, limit: 20, total: 0, totalPages }, counts: { total: 5, favorites, categories: {} },
})

function Pages({ filters }: { filters: RecipeFilters }) {
	const { query, counts } = useRecipePages('user-1', '/backend/recipes', filters)
	return <>
		<p>{query.isFetching ? 'loading' : 'loaded'}</p>
		<p>{counts ? `${counts.favorites} favorites` : 'uncounted'}</p>
		<button type="button" onClick={() => void query.fetchNextPage()}>More</button>
	</>
}

// The favorite state is shared by recipe id for the whole session, so each test uses its own recipe.
let counter = 0
async function removeFavorite(filters: RecipeFilters) {
	const user = userEvent.setup()
	render(<QueryClientProvider client={new QueryClient()}><AppToaster>
		<Pages filters={filters} />
		<FavoriteButton recipeId={`listed-${++counter}`} title="Tomato Soup" isFavorite />
	</AppToaster></QueryClientProvider>)
	await screen.findByText('loaded')
	await user.click(screen.getByRole('button', { name: 'Remove Tomato Soup from favorites' }))
	return user
}

beforeEach(() => {
	api.fetchRecipePage.mockReset().mockResolvedValue(listPage(3))
	action.setFavorite.mockReset().mockResolvedValue({ ok: true })
	// jsdom has no IntersectionObserver; the sentinel only needs one to exist while another page is available.
	vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
})
afterEach(() => vi.unstubAllGlobals())

it('reloads the favorites list once a favorite change is confirmed, and takes the reloaded total as counted', async () => {
	api.fetchRecipePage.mockResolvedValueOnce(listPage(3)).mockResolvedValue(listPage(2))
	await removeFavorite(favoritesOnly)
	await waitFor(() => expect(api.fetchRecipePage).toHaveBeenCalledTimes(2))
	await screen.findByText('loaded')
	expect(screen.getByText('2 favorites')).toBeInTheDocument()
})

it('keeps the favorites list as loaded when the change fails', async () => {
	action.setFavorite.mockResolvedValue({ ok: false, reason: 'failed' })
	await removeFavorite(favoritesOnly)
	await screen.findByRole('alert')
	expect(api.fetchRecipePage).toHaveBeenCalledTimes(1)
	expect(screen.getByText('3 favorites')).toBeInTheDocument()
})

it('adjusts the favorites total of other lists without reloading them, across later pages too', async () => {
	api.fetchRecipePage.mockImplementation(async (_endpoint, _filters, page: number) => listPage(3, page, 2))
	const user = await removeFavorite(sorting)
	expect(await screen.findByText('2 favorites')).toBeInTheDocument()
	expect(api.fetchRecipePage).toHaveBeenCalledTimes(1)

	await user.click(screen.getByRole('button', { name: 'More' }))
	await waitFor(() => expect(api.fetchRecipePage).toHaveBeenCalledTimes(2))
	await screen.findByText('loaded')
	expect(screen.getByText('2 favorites')).toBeInTheDocument()
})
