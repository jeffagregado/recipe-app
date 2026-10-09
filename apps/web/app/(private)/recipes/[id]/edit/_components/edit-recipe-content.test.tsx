import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RecipeDetail } from '@recipe-app/contracts/types'
import type { ImgHTMLAttributes } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import type { SaveRecipeResult } from '@/features/recipes/form/lib/save-recipe-result'
import { recipeDetailFixture } from '@/features/recipes/queries/recipe-detail.fixture'

const read = vi.hoisted(() => ({ getRecipe: vi.fn<(id: string) => Promise<RecipeDetail | null>>() }))
vi.mock('@/features/recipes/queries/get-recipe', () => ({ getRecipe: read.getRecipe }))
const action = vi.hoisted(() => ({ updateRecipe: vi.fn<(id: string, formData: FormData) => Promise<SaveRecipeResult>>() }))
vi.mock('../actions', () => action)
const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') }, useRouter: () => router, unstable_rethrow: () => undefined }))
vi.mock('next/image', () => ({
	default: ({ src, alt }: ImgHTMLAttributes<HTMLImageElement>) => (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={src as string} alt={alt} />
	),
}))

import { EditRecipeContent } from './edit-recipe-content'

async function renderEdit(recipe: RecipeDetail | null, id = 'recipe-1') {
	read.getRecipe.mockResolvedValue(recipe)
	render(<AppToaster>{await EditRecipeContent({ params: Promise.resolve({ id }) })}</AppToaster>)
}

beforeEach(() => {
	read.getRecipe.mockReset()
	action.updateRecipe.mockReset()
	router.push.mockReset()
})

it('renders the shared form as Edit Recipe, pre-filled from the stored recipe', async () => {
	await renderEdit(recipeDetailFixture({ title: 'Layered Cake', imageUrl: 'https://storage.example/cover.jpg' }))
	expect(read.getRecipe).toHaveBeenCalledWith('recipe-1')
	expect(screen.getByRole('heading', { level: 1, name: 'Edit Recipe' })).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
	expect(screen.getByLabelText('Title')).toHaveValue('Layered Cake')
	expect(screen.getByLabelText('Ingredient 1 name')).toHaveValue('Tomatoes')
	expect(screen.getByLabelText('Step 1 instructions')).toHaveValue('Simmer.')
	expect(screen.getByAltText('Current cover photo')).toHaveAttribute('src', 'https://storage.example/cover.jpg')
})

it('saves through the update action bound to this recipe', async () => {
	const user = userEvent.setup()
	action.updateRecipe.mockResolvedValue({ status: 'failed', message: 'x' })
	await renderEdit(recipeDetailFixture({ id: 'recipe-9' }), 'recipe-9')
	await user.click(screen.getByRole('button', { name: 'Save Changes' }))

	await waitFor(() => expect(action.updateRecipe).toHaveBeenCalledOnce())
	const [recipeId, data] = action.updateRecipe.mock.calls[0]
	expect(recipeId).toBe('recipe-9')
	expect(JSON.parse(data.get('recipe') as string)).toMatchObject({ title: 'Tomato Soup', cover: 'remove', instructions: [{ id: 'step-1', image: 'remove' }] })
})

it('cancels back to the recipe page', async () => {
	const user = userEvent.setup()
	await renderEdit(recipeDetailFixture({ id: 'recipe-1' }))
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	expect(router.push).toHaveBeenCalledWith('/recipes/recipe-1')
})

it('calls notFound for an unknown or foreign recipe', async () => {
	await expect(renderEdit(null)).rejects.toThrow('NEXT_NOT_FOUND')
})
