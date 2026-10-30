import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import { installFakeCanvas } from '@/test/fake-canvas'
import { createEmptyRecipeValues, type RecipeFormValues } from '../lib/recipe-form-schema'
import type { SaveRecipeResult } from '../lib/save-recipe-result'
import type { PhotoDiscarder, PhotoUploader } from '../lib/upload-pending-photo'
import { RecipeForm } from './recipe-form'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => router }))

const onSave = vi.fn<(formData: FormData) => Promise<SaveRecipeResult>>()
const uploadPhoto = vi.fn<PhotoUploader>()
const discardPhoto = vi.fn<PhotoDiscarder>()
const PHOTO_ID = '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70'

beforeEach(() => {
	vi.resetAllMocks()
	installFakeCanvas()
	onSave.mockResolvedValue({ status: 'failed', message: 'Couldn’t save recipe. Try again.' })
	uploadPhoto.mockResolvedValue({ status: 'uploaded', id: PHOTO_ID })
	URL.createObjectURL = vi.fn(() => 'blob:preview')
	URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

function renderForm(initialValues?: RecipeFormValues) {
	return render(<AppToaster><RecipeForm categories={[]} mode="create" title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={onSave} onUploadPhoto={uploadPhoto} onDiscardPhoto={discardPhoto} initialValues={initialValues} /></AppToaster>)
}
const ingredients = () => screen.getByRole('region', { name: /^Ingredients/ })
const instructions = () => screen.getByRole('region', { name: /^Instructions/ })
const save = () => screen.getByRole('button', { name: /^Save Recipe$|^Saving/ })
const sent = () => JSON.parse(onSave.mock.calls[0][0].get('recipe') as string)
const toTaste = (name: string) => ({ name, amount: '', unit: 'to-taste' as const })
const step = (description: string) => ({ key: description, id: null, description, photo: { kind: 'none' as const } })

/** A filled recipe whose rows can be saved as they are. */
function filled(overrides: Partial<RecipeFormValues>): RecipeFormValues {
	return { ...createEmptyRecipeValues(), title: 'Pasta', ingredients: [{ heading: null, rows: [toTaste('Salt')] }], instructions: [{ heading: null, steps: [step('Boil')] }], ...overrides }
}

it('adds a named group with one empty row below the others and focuses its name', async () => {
	const user = userEvent.setup()
	renderForm()
	expect(within(ingredients()).queryByLabelText(/group 1 name/)).not.toBeInTheDocument()
	await user.click(within(ingredients()).getByRole('button', { name: 'Add group' }))
	const heading = screen.getByLabelText('Ingredient group 1 name')
	await waitFor(() => expect(heading).toHaveFocus())
	expect(heading).toHaveAttribute('placeholder', 'Group name, such as Sauces')
	expect(screen.getByLabelText('Ingredient 2 name')).toHaveValue('')
	expect(within(ingredients()).getAllByRole('button', { name: 'Add ingredient' })).toHaveLength(2)

	await user.click(within(instructions()).getByRole('button', { name: 'Add group' }))
	await waitFor(() => expect(screen.getByLabelText('Step group 1 name')).toHaveFocus())
	expect(screen.getByLabelText('Step 2 instructions')).toBeInTheDocument()
})

it('flattens groups on save with each heading on its first row and step numbers running on', async () => {
	const user = userEvent.setup()
	renderForm(filled({}))
	await user.click(within(ingredients()).getByRole('button', { name: 'Add group' }))
	await user.keyboard('  Sauce ')
	await user.type(screen.getByLabelText('Ingredient 2 name'), 'Cream')
	await user.type(screen.getByLabelText('Ingredient 2 amount'), '1 1/2')
	await user.click(screen.getByLabelText('Ingredient 2 unit'))
	await user.click(await screen.findByRole('option', { name: 'cup' }))
	await user.click(within(instructions()).getByRole('button', { name: 'Add group' }))
	await user.keyboard('Serve')
	await user.type(screen.getByLabelText('Step 2 instructions'), 'Plate')
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(sent().ingredients).toEqual([
		{ name: 'Salt', quantity: null, unit: null, heading: null },
		{ name: 'Cream', quantity: 1.5, unit: 'cup', heading: 'Sauce' },
	])
	expect(sent().instructions).toEqual([{ description: 'Boil', hasImage: false, heading: null }, { description: 'Plate', hasImage: false, heading: 'Serve' }])
})

it('moves rows across group headings by keyboard, but never empties a group', async () => {
	const user = userEvent.setup()
	renderForm(filled({ ingredients: [{ heading: null, rows: [toTaste('Salt')] }, { heading: 'Sauce', rows: [toTaste('Butter'), toTaste('Cream')] }] }))
	expect(screen.getByRole('button', { name: 'Move ingredient 1 down' })).toBeDisabled()
	screen.getByRole('button', { name: 'Move ingredient 2 up' }).focus()
	await user.keyboard('{Enter}')
	expect(screen.getByLabelText('Ingredient 2 name')).toHaveValue('Butter')
	await waitFor(() => expect(screen.getByRole('button', { name: 'Move ingredient 2 up' })).toHaveFocus())
	expect(screen.getByRole('button', { name: 'Move ingredient 2 up' })).toBeEnabled()
	expect(screen.getByRole('button', { name: 'Move ingredient 3 up' })).toBeDisabled()
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(sent().ingredients.map(({ name, heading }: { name: string; heading: string | null }) => [name, heading])).toEqual([['Salt', null], ['Butter', null], ['Cream', 'Sauce']])
})

it('keeps a step photo with its step when it moves into another group', async () => {
	const user = userEvent.setup()
	renderForm(filled({ instructions: [{ heading: null, steps: [step('Boil'), step('Drain')] }, { heading: 'Serve', steps: [step('Plate')] }] }))
	await user.upload(screen.getByLabelText('Add photo to step 2'), new File(['x'], 'drain.jpg', { type: 'image/jpeg' }))
	await screen.findByText('drain.webp · 1 KB')
	await user.click(screen.getByRole('button', { name: 'Move step 2 down' }))
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(sent().instructions).toEqual([
		{ description: 'Boil', hasImage: false, heading: null },
		{ description: 'Drain', hasImage: false, image: { pendingPhotoId: PHOTO_ID }, heading: 'Serve' },
		{ description: 'Plate', hasImage: false, heading: null },
	])
})

it('reorders named groups and merges a removed heading’s rows into the group above', async () => {
	const user = userEvent.setup()
	renderForm(filled({ ingredients: [
		{ heading: null, rows: [toTaste('Salt')] }, { heading: 'Sauce', rows: [toTaste('Butter')] }, { heading: 'Topping', rows: [toTaste('Cheese')] },
	] }))
	expect(screen.getByRole('button', { name: 'Move ingredient group 1 up' })).toBeDisabled()
	expect(screen.getByRole('button', { name: 'Move ingredient group 2 down' })).toBeDisabled()
	await user.click(screen.getByRole('button', { name: 'Move ingredient group 2 up' }))
	expect(screen.getByLabelText('Ingredient group 1 name')).toHaveValue('Topping')
	await waitFor(() => expect(screen.getByRole('button', { name: 'Move ingredient group 1 down' })).toHaveFocus())

	await user.click(screen.getByRole('button', { name: 'Remove heading from ingredient group 1' }))
	expect(screen.queryByLabelText('Ingredient group 2 name')).not.toBeInTheDocument()
	expect(screen.getByLabelText('Ingredient group 1 name')).toHaveValue('Sauce')
	await waitFor(() => expect(screen.getByLabelText('Ingredient 2 name')).toHaveFocus())
	expect([1, 2, 3].map((position) => (screen.getByLabelText(`Ingredient ${position} name`) as HTMLInputElement).value)).toEqual(['Salt', 'Cheese', 'Butter'])
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(sent().ingredients.map(({ heading }: { heading: string | null }) => heading)).toEqual([null, null, 'Sauce'])
})

const lists = [
	{ list: 'ingredients', region: ingredients, noun: 'ingredient', placeholder: 'Group name, such as Sauces' },
	{ list: 'instructions', region: instructions, noun: 'step', placeholder: 'Group name, such as Make the sauce' },
] as const

it.each(lists)('offers a heading for the first $noun group of a recipe with no groups, and saves the titled group', async ({ list, region, noun, placeholder }) => {
	const user = userEvent.setup()
	renderForm(filled({}))
	await user.click(within(region()).getByRole('button', { name: 'Add heading' }))
	const first = screen.getByLabelText(`First ${noun} group name`)
	await waitFor(() => expect(first).toHaveFocus())
	expect(first).toHaveAttribute('placeholder', placeholder)
	expect(within(region()).queryByRole('button', { name: 'Add heading' })).not.toBeInTheDocument()
	expect(within(region()).queryByRole('button', { name: new RegExp(`^Move first ${noun} group`) })).not.toBeInTheDocument()
	await user.keyboard('Prep')
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(sent()[list].map(({ heading }: { heading: string | null }) => heading)).toEqual(['Prep'])
})

it('shows a saved first-group heading in its input, and removing it brings the link back with focus', async () => {
	const user = userEvent.setup()
	renderForm(filled({ ingredients: [{ heading: 'Dough', rows: [toTaste('Flour')] }, { heading: 'Sauce', rows: [toTaste('Butter')] }] }))
	expect(screen.getByLabelText('First ingredient group name')).toHaveValue('Dough')
	expect(within(ingredients()).queryByRole('button', { name: 'Add heading' })).not.toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: 'Remove heading from first ingredient group' }))
	expect(screen.queryByLabelText('First ingredient group name')).not.toBeInTheDocument()
	await waitFor(() => expect(within(ingredients()).getByRole('button', { name: 'Add heading' })).toHaveFocus())
})

it('keeps the first group’s heading once the named groups below are gone, and removing it then brings the link back with focus', async () => {
	const user = userEvent.setup()
	renderForm(filled({ instructions: [{ heading: 'Prep', steps: [step('Boil')] }, { heading: 'Serve', steps: [step('Plate')] }] }))
	await user.click(screen.getByRole('button', { name: 'Remove heading from step group 1' }))
	expect(screen.getByLabelText('First step group name')).toHaveValue('Prep')
	await user.click(screen.getByRole('button', { name: 'Remove heading from first step group' }))
	await waitFor(() => expect(within(instructions()).getByRole('button', { name: 'Add heading' })).toHaveFocus())
})

it('removes a named group with its last row', async () => {
	const user = userEvent.setup()
	renderForm(filled({ ingredients: [{ heading: null, rows: [toTaste('Salt')] }, { heading: 'Sauce', rows: [toTaste('Butter')] }] }))
	await user.click(screen.getByRole('button', { name: 'Remove ingredient 2' }))
	expect(screen.queryByLabelText('Ingredient group 1 name')).not.toBeInTheDocument()
	await waitFor(() => expect(screen.getByLabelText('Ingredient 1 name')).toHaveFocus())
})

it('asks for a name under a blank group heading, focuses it and does not save', async () => {
	const user = userEvent.setup()
	renderForm(filled({}))
	await user.click(within(instructions()).getByRole('button', { name: 'Add group' }))
	await user.type(screen.getByLabelText('Step 2 instructions'), 'Plate')
	await user.click(save())
	const heading = screen.getByLabelText('Step group 1 name')
	await waitFor(() => expect(heading).toHaveFocus())
	expect(heading).toHaveAccessibleDescription('Name this group, or remove the heading.')
	expect(onSave).not.toHaveBeenCalled()
	await user.click(screen.getByRole('button', { name: 'Remove heading from step group 1' }))
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
})

it('shows the limit under every group and hides Add group once the rows across groups reach it', () => {
	const rows = (length: number) => Array.from({ length }, (_, index) => toTaste(`Item ${index}`))
	renderForm(filled({ ingredients: [{ heading: null, rows: rows(60) }, { heading: 'Sauce', rows: rows(40) }] }))
	expect(within(ingredients()).getAllByText('You’ve reached the limit of 100 ingredients.')).toHaveLength(2)
	expect(within(ingredients()).queryByRole('button', { name: /^Add (group|ingredient)$/ })).not.toBeInTheDocument()
	expect(within(instructions()).getByRole('button', { name: 'Add group' })).toBeInTheDocument()
})

it('puts server errors for flat rows and headings on the matching group fields', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({
		status: 'invalid', message: 'Check the highlighted fields and try again.',
		fieldErrors: { 'ingredients.1.name': ['Name rejected.'], 'instructions.1.heading': ['Heading rejected.'], 'step-1': ['Photo rejected.'] },
	})
	renderForm(filled({
		ingredients: [{ heading: null, rows: [toTaste('Salt')] }, { heading: 'Sauce', rows: [toTaste('Butter')] }],
		instructions: [{ heading: null, steps: [step('Boil')] }, { heading: 'Serve', steps: [step('Plate')] }],
	}))
	await user.click(save())
	await waitFor(() => expect(screen.getByLabelText('Ingredient 2 name')).toHaveFocus())
	expect(screen.getByLabelText('Ingredient 2 name')).toHaveAccessibleDescription('Name rejected.')
	expect(screen.getByLabelText('Step group 1 name')).toHaveAccessibleDescription('Heading rejected.')
	expect(screen.getByLabelText('Add photo to step 2')).toHaveAccessibleDescription('Photo rejected.')
})
