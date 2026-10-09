import { render, screen, within } from '@testing-library/react'
import type { RecipeDetail } from '@recipe-app/contracts/types'
import type { ImgHTMLAttributes } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { recipeDetailFixture } from '@/features/recipes/queries/recipe-detail.fixture'

const read = vi.hoisted(() => ({ getRecipe: vi.fn<(id: string) => Promise<RecipeDetail | null>>() }))
vi.mock('@/features/recipes/queries/get-recipe', () => ({ getRecipe: read.getRecipe }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND') } }))
// The image optimizer needs remotePatterns and a server; render a plain img instead.
vi.mock('next/image', () => ({
	default: ({ src, alt }: ImgHTMLAttributes<HTMLImageElement>) => (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={src} alt={alt} />
	),
}))

import { RecipeDetailContent } from './recipe-detail-content'

async function renderRecipe(recipe: RecipeDetail | null, searchParams: Record<string, string | string[] | undefined> = {}) {
	read.getRecipe.mockResolvedValue(recipe)
	render(await RecipeDetailContent({ params: Promise.resolve({ id: 'recipe-1' }), searchParams: Promise.resolve(searchParams) }))
}

beforeEach(() => read.getRecipe.mockReset())

it('renders a minimal recipe without optional sections', async () => {
	await renderRecipe(recipeDetailFixture())
	expect(read.getRecipe).toHaveBeenCalledWith('recipe-1')
	expect(screen.getByRole('heading', { level: 1, name: 'Tomato Soup' })).toBeInTheDocument()
	expect(screen.getByRole('heading', { name: 'Ingredients' })).toBeInTheDocument()
	expect(screen.getByRole('heading', { name: 'Instructions' })).toBeInTheDocument()
	expect(screen.queryByRole('img')).not.toBeInTheDocument()
	expect(screen.queryByRole('heading', { name: 'Notes' })).not.toBeInTheDocument()
	expect(screen.queryByRole('heading', { name: 'Video' })).not.toBeInTheDocument()
	expect(screen.queryByTitle(/video/i)).not.toBeInTheDocument()
	expect(screen.queryByText(/min$|serving/)).not.toBeInTheDocument()
	expect(screen.queryByRole('list', { name: 'Categories' })).not.toBeInTheDocument()
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('renders every detail of a rich recipe in order', async () => {
	await renderRecipe(recipeDetailFixture({
		title: 'Layered Cake',
		categories: ['Desserts', 'Breakfast', 'Snacks'],
		description: 'Sweet and soft.',
		imageUrl: 'https://storage.example/cover.jpg',
		servings: 8,
		prepTimeMinutes: 20,
		cookTimeMinutes: 40,
		notes: 'Line one\nLine two',
		videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		ingredients: [
			{ id: 'i1', ingredientId: 'b1', name: 'Flour', quantity: 200, unit: 'g', preparation: null, note: null, sortOrder: 0 },
			{ id: 'i2', ingredientId: 'b2', name: 'Sugar', quantity: 1.5, unit: 'cup', preparation: null, note: null, sortOrder: 1 },
			{ id: 'i3', ingredientId: 'b3', name: 'Salt', quantity: null, unit: null, preparation: null, note: null, sortOrder: 2 },
		],
		instructions: [
			{ id: 's1', stepNumber: 1, description: 'Mix.', imageUrl: null },
			{ id: 's2', stepNumber: 2, description: 'Bake.', imageUrl: 'https://storage.example/step2.jpg' },
		],
	}))

	expect(screen.getByRole('img', { name: 'Layered Cake' })).toHaveAttribute('src', 'https://storage.example/cover.jpg')
	const categories = within(screen.getByRole('list', { name: 'Categories' })).getAllByRole('listitem')
	expect(categories.map((item) => item.textContent)).toEqual(['Desserts', 'Breakfast', 'Snacks'])
	expect(screen.getByText('Prep 20 min')).toBeInTheDocument()
	expect(screen.getByText('Cook 40 min')).toBeInTheDocument()
	expect(screen.getByText('Total 60 min')).toBeInTheDocument()
	expect(screen.getByText('8 servings')).toBeInTheDocument()
	expect(screen.getByText('Sweet and soft.')).toBeInTheDocument()

	const ingredients = within(screen.getByRole('list', { name: 'Ingredients' })).getAllByRole('listitem')
	expect(ingredients.map((item) => item.textContent)).toEqual(['200 g Flour', '1.5 cup Sugar', 'Salt, to taste'])

	const video = screen.getByTitle(/video/i)
	expect(video).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
	expect(video).toHaveAttribute('loading', 'lazy')
	expect(video).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
	// Chromium warns when both are present, and allow already grants fullscreen.
	expect(video.getAttribute('allow')).toContain('fullscreen')
	expect(video).not.toHaveAttribute('allowfullscreen')

	const steps = within(screen.getByRole('list', { name: 'Instructions' })).getAllByRole('listitem')
	expect(steps).toHaveLength(2)
	expect(within(steps[0]).queryByRole('img')).not.toBeInTheDocument()
	expect(within(steps[1]).getByRole('img', { name: 'Step 2 photo' })).toHaveAttribute('src', 'https://storage.example/step2.jpg')

	const notes = screen.getByText(/Line one/)
	expect(notes).toHaveTextContent('Line one Line two')
	expect(notes).toHaveClass('whitespace-pre-line')
})

it('formats singular servings and keeps zero minutes as a value', async () => {
	await renderRecipe(recipeDetailFixture({ servings: 1, prepTimeMinutes: 0, cookTimeMinutes: 15 }))
	expect(screen.getByText('1 serving')).toBeInTheDocument()
	expect(screen.getByText('Prep 0 min')).toBeInTheDocument()
	expect(screen.getByText('Total 15 min')).toBeInTheDocument()
})

it('omits the total when only one time exists', async () => {
	await renderRecipe(recipeDetailFixture({ prepTimeMinutes: 10 }))
	expect(screen.getByText('Prep 10 min')).toBeInTheDocument()
	expect(screen.queryByText(/Total/)).not.toBeInTheDocument()
	expect(screen.queryByText(/Cook/)).not.toBeInTheDocument()
})

it('links to other video hosts in a new tab instead of embedding them', async () => {
	await renderRecipe(recipeDetailFixture({ videoUrl: 'https://videos.example/cook' }))
	const link = screen.getByRole('link', { name: /watch video/i })
	expect(link).toHaveAttribute('href', 'https://videos.example/cook')
	expect(link).toHaveAttribute('target', '_blank')
	expect(link).toHaveAttribute('rel', 'noopener noreferrer')
	expect(screen.queryByTitle(/video/i)).not.toBeInTheDocument()
})

it('renders nothing for an unsafe stored video link', async () => {
	await renderRecipe(recipeDetailFixture({ videoUrl: 'javascript:alert(1)' }))
	expect(screen.queryByRole('heading', { name: 'Video' })).not.toBeInTheDocument()
	expect(screen.queryByRole('link', { name: /watch video/i })).not.toBeInTheDocument()
})

it('shows the saved notice only for the recipe-saved search param', async () => {
	await renderRecipe(recipeDetailFixture(), { notice: 'recipe-saved' })
	expect(screen.getByRole('status')).toHaveTextContent('Recipe saved')
})

it.each([{ notice: 'other' }, {}, { notice: ['recipe-saved', 'x'] }])('hides the saved notice for %j', async (searchParams) => {
	await renderRecipe(recipeDetailFixture(), searchParams)
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('calls notFound for an unknown or foreign recipe', async () => {
	await expect(renderRecipe(null)).rejects.toThrow('NEXT_NOT_FOUND')
})
