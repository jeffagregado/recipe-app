import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { SessionExpiredError } from '@/features/auth/errors'
import { RecipeResults } from './recipe-results'

const hook = vi.hoisted(() => ({ useRecipePages: vi.fn() }))
vi.mock('@/features/recipes/hooks/use-recipe-pages', () => hook)
vi.mock('./recipe-controls', () => ({ RecipeControls: () => <div>Controls</div> }))
vi.mock('./recipe-list', () => ({ RecipeList: ({ recipes }: { recipes: unknown[] }) => <p>{recipes.length} recipes listed</p> }))

const filters = { sortBy: 'createdAt', order: 'desc' } as const
const page = (total: number) => ({ data: Array.from({ length: Math.min(total, 2) }, (_, index) => ({ id: `r${index}` })), meta: { total }, counts: { total } })
const renderResults = () => render(<RecipeResults userId="user-1" endpoint="/backend/recipes" filters={filters} onCategory={vi.fn()} onSort={vi.fn()} />)
const state = (query: object) => hook.useRecipePages.mockReturnValue({ sentinel: { current: null }, query: { error: null, isPending: false, isFetching: false, isLoading: false, isFetchNextPageError: false, isFetchingNextPage: false, ...query } })

beforeEach(() => { hook.useRecipePages.mockReset() })

it('keys the page query by the signed-in user', () => {
	state({ data: { pages: [page(2)] } })
	renderResults()
	expect(hook.useRecipePages).toHaveBeenCalledWith('user-1', '/backend/recipes', filters)
})

it('shows the empty-library state for an account without recipes', () => {
	state({ data: { pages: [page(0)] } })
	renderResults()
	expect(screen.getByText('Your recipe library is empty.')).toBeInTheDocument()
	expect(screen.queryByText(/recipes listed/)).not.toBeInTheDocument()
})

it('lists owned recipes when the library has entries', () => {
	state({ data: { pages: [page(2)] } })
	renderResults()
	expect(screen.getByText('2 recipes listed')).toBeInTheDocument()
	expect(screen.queryByText('Your recipe library is empty.')).not.toBeInTheDocument()
})

it('reports session expiry instead of a recipe outage', () => {
	state({ error: new SessionExpiredError() })
	renderResults()
	expect(screen.getByRole('status')).toHaveTextContent('Your session has expired')
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows a retryable error without data for an ordinary failure', () => {
	state({ error: new Error('Test outage') })
	renderResults()
	expect(screen.getByRole('alert')).toHaveTextContent('Test outage')
})
