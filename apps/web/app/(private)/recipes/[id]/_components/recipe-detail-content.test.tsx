import { render, screen, within } from '@testing-library/react'
import type { RecipeDetail } from '@recipe-app/contracts/types'
import type { ImgHTMLAttributes } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import { recipeDetailFixture } from '@/features/recipes/queries/recipe-detail.fixture'

const read = vi.hoisted(() => ({ getRecipe: vi.fn<(id: string) => Promise<RecipeDetail | null>>() }))
vi.mock('@/features/recipes/queries/get-recipe', () => ({ getRecipe: read.getRecipe }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))
// The image optimizer needs remotePatterns and a server; render a plain img instead.
vi.mock('next/image', () => ({
	default: ({ src, alt }: ImgHTMLAttributes<HTMLImageElement>) => (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={src} alt={alt} />
	),
}))

import { RecipeDetailContent } from './recipe-detail-content'

async function renderRecipe(recipe: RecipeDetail | null) {
	read.getRecipe.mockResolvedValue(recipe)
	render(<AppToaster>{await RecipeDetailContent({ params: Promise.resolve({ id: 'recipe-1' }) })}</AppToaster>)
}

beforeEach(() => read.getRecipe.mockReset())

const sections = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)

it('renders a minimal recipe without cover, video, notes, scaler or meta', async () => {
	await renderRecipe(recipeDetailFixture())
	expect(read.getRecipe).toHaveBeenCalledWith('recipe-1')
	expect(screen.getByRole('heading', { level: 1, name: 'Tomato Soup' })).toBeInTheDocument()
	expect(sections()).toEqual(['Ingredients', 'Instructions'])
	expect(screen.queryByRole('img')).not.toBeInTheDocument()
	expect(screen.queryByRole('group', { name: 'Servings' })).not.toBeInTheDocument()
	expect(screen.queryByRole('list', { name: 'Categories' })).not.toBeInTheDocument()
	expect(screen.queryByRole('list', { name: 'Recipe details' })).not.toBeInTheDocument()
	expect(screen.queryByRole('button', { name: 'Play video' })).not.toBeInTheDocument()
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
	expect(within(screen.getByRole('list', { name: 'Ingredients' })).getByRole('checkbox', { name: /Tomatoes/ })).toBeInTheDocument()
})

it('starts at the title when there is no cover', async () => {
	await renderRecipe(recipeDetailFixture())
	expect(screen.getByRole('article').firstElementChild?.tagName).toBe('HEADER')
})

it('renders every detail of a rich recipe, with the sections in mobile order', async () => {
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

	const cover = screen.getByRole('img', { name: 'Layered Cake' })
	expect(cover).toHaveAttribute('src', 'https://storage.example/cover.jpg')
	expect(screen.getByRole('article').firstElementChild).toContainElement(cover)
	const categories = within(screen.getByRole('list', { name: 'Categories' })).getAllByRole('listitem')
	expect(categories.map((item) => item.textContent)).toEqual(['Desserts', 'Breakfast', 'Snacks'])
	const details = screen.getByRole('list', { name: 'Recipe details' })
	expect(details).toHaveTextContent(/Prep 20 min.*Cook 40 min.*Total 60 min/)
	expect(details).toHaveTextContent('8 servings')
	expect(screen.getByText('Sweet and soft.')).toBeInTheDocument()

	expect(sections()).toEqual(['Ingredients', 'Video', 'Instructions', 'Notes'])
	const ingredients = within(screen.getByRole('list', { name: 'Ingredients' })).getAllByRole('listitem')
	expect(ingredients.map((item) => item.textContent)).toEqual(['Flour200 g', 'Sugar1.5 cup', 'Saltto taste'])
	expect(screen.getByRole('group', { name: 'Servings' })).toBeInTheDocument()

	expect(screen.getByRole('button', { name: 'Play video' })).toBeInTheDocument()
	expect(document.querySelector('iframe')).toBeNull()

	const steps = within(screen.getByRole('list', { name: 'Instructions' })).getAllByRole('listitem')
	expect(steps).toHaveLength(2)
	expect(within(steps[0]).queryByRole('button')).not.toBeInTheDocument()
	expect(within(steps[1]).getByRole('button', { name: 'Open step 2 photo' })).toBeInTheDocument()

	const notes = screen.getByText(/Line one/)
	expect(notes).toHaveTextContent('Line one Line two')
	expect(notes).toHaveClass('whitespace-pre-line')
})

it('shows only the times and servings the recipe has', async () => {
	await renderRecipe(recipeDetailFixture({ servings: 1, prepTimeMinutes: 0, cookTimeMinutes: null }))
	const details = screen.getByRole('list', { name: 'Recipe details' })
	expect(details).toHaveTextContent('Prep 0 min')
	expect(details).toHaveTextContent('1 serving')
	expect(details).not.toHaveTextContent(/Cook|Total/)
})

it('does not show the saved notice inline any more; the toast replaces it', async () => {
	await renderRecipe(recipeDetailFixture())
	expect(screen.queryByText('Recipe saved')).not.toBeInTheDocument()
})

it('renders no video section for an unsafe stored video link', async () => {
	await renderRecipe(recipeDetailFixture({ videoUrl: 'javascript:alert(1)' }))
	expect(screen.queryByRole('heading', { name: 'Video' })).not.toBeInTheDocument()
})

it('renders the not-found card, without throwing, for an unknown or foreign recipe', async () => {
	await renderRecipe(null)
	expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'Go now' })).toHaveAttribute('href', '/recipes')
	expect(screen.queryByRole('article')).not.toBeInTheDocument()
})

it('puts the favorite heart and the ⋮ menu to the right of the title, in that order', async () => {
	await renderRecipe(recipeDetailFixture({ isFavorite: true }))
	const row = screen.getByRole('heading', { level: 1, name: 'Tomato Soup' }).parentElement!
	const [heart, menu] = within(row).getAllByRole('button')
	expect(heart).toHaveAccessibleName('Remove Tomato Soup from favorites')
	expect(heart).toHaveAttribute('aria-pressed', 'true')
	expect(menu).toHaveAccessibleName('More options for Tomato Soup')
})

it('starts the heart unpressed for a recipe that is not a favorite', async () => {
	await renderRecipe(recipeDetailFixture({ id: 'recipe-not-favorite', isFavorite: false }))
	expect(screen.getByRole('button', { name: 'Add Tomato Soup to favorites' })).toHaveAttribute('aria-pressed', 'false')
})
