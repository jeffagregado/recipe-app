import { render, screen, within } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import { toRecipeFormValues } from '@/features/recipes/form/lib/recipe-edit'
import { RecipeForm } from '@/features/recipes/form/components/recipe-form'
import { recipeDetailFixture } from '@/features/recipes/queries/recipe-detail.fixture'
import { DemoModeProvider } from './demo-mode'

vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => ({ push: vi.fn() }) }))
// The image optimizer needs remotePatterns and a server; render a plain img instead.
vi.mock('next/image', () => ({
	// eslint-disable-next-line @next/next/no-img-element
	default: ({ src, alt }: ImgHTMLAttributes<HTMLImageElement>) => <img src={src as string} alt={alt} />,
}))

const NOTE = 'Photo uploads are off in the demo'

const recipe = recipeDetailFixture({
	id: 'recipe-1',
	title: 'Layered Cake',
	imageUrl: 'https://storage.example/cover.jpg',
	instructions: [
		{ id: 's1', stepNumber: 1, description: 'Mix.', imageUrl: 'https://storage.example/s1.jpg', heading: null },
		{ id: 's2', stepNumber: 2, description: 'Bake.', imageUrl: null, heading: null },
	],
})

function renderForm(mode: 'create' | 'edit') {
	const form = mode === 'edit'
		? <RecipeForm categories={[]} mode="edit" title="Edit Recipe" submitLabel="Save Changes" cancelHref="/recipes/recipe-1" onSave={vi.fn()} initialValues={toRecipeFormValues(recipe)} />
		: <RecipeForm categories={[]} mode="create" title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={vi.fn()} />
	render(<AppToaster><DemoModeProvider>{form}</DemoModeProvider></AppToaster>)
}

const section = (name: string | RegExp) => screen.getByRole('region', { name })

it('disables every photo picker on create and says uploads are off where the file hint was', () => {
	renderForm('create')
	expect(screen.getByLabelText('Add cover photo')).toBeDisabled()
	expect(screen.getByLabelText('Add photo to step 1')).toBeDisabled()
	expect(within(section('Cover Photo')).getByText(NOTE)).toBeInTheDocument()
	expect(within(section(/^Instructions/)).getByText(NOTE)).toBeInTheDocument()
	expect(screen.queryByText('JPG, PNG or WebP · up to 5 MB')).not.toBeInTheDocument()
})

it('keeps the stored photos on edit, with Replace and Remove disabled', () => {
	renderForm('edit')
	expect(screen.getByRole('img', { name: 'Current cover photo' })).toHaveAttribute('src', 'https://storage.example/cover.jpg')
	expect(screen.getByRole('img', { name: 'Current photo for step 1' })).toHaveAttribute('src', 'https://storage.example/s1.jpg')
	for (const label of ['Replace cover photo', 'Replace photo for step 1', 'Add photo to step 2']) expect(screen.getByLabelText(label)).toBeDisabled()
	for (const name of ['Remove cover photo', 'Remove photo from step 1']) expect(screen.getByRole('button', { name })).toBeDisabled()
	expect(within(section('Cover Photo')).getAllByText(NOTE)).toHaveLength(1)
	expect(within(section(/^Instructions/)).getAllByText(NOTE)).toHaveLength(2)
	expect(screen.queryByText('Current photo')).not.toBeInTheDocument()
})
