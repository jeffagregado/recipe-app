import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Activity, type ImgHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import { recipeDetailFixture } from '@/features/recipes/queries/recipe-detail.fixture'
import { toRecipeFormValues } from '../lib/recipe-edit'
import type { SaveRecipeResult } from '../lib/save-recipe-result'
import { RecipeForm } from './recipe-form'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => router }))
// The image optimizer needs remotePatterns and a server; render a plain img (with its error event) instead.
vi.mock('next/image', () => ({
	default: ({ src, alt, onError }: ImgHTMLAttributes<HTMLImageElement>) => (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={src as string} alt={alt} onError={onError} />
	),
}))

const onSave = vi.fn<(formData: FormData) => Promise<SaveRecipeResult>>()

beforeEach(() => {
	vi.resetAllMocks()
	let counter = 0
	URL.createObjectURL = vi.fn(() => `blob:preview-${++counter}`)
	URL.revokeObjectURL = vi.fn()
})
afterEach(() => { vi.restoreAllMocks() })

const recipe = recipeDetailFixture({
	id: 'recipe-1',
	title: 'Layered Cake',
	description: 'Sweet and soft.',
	categories: ['Desserts', 'Breakfast'],
	imageUrl: 'https://storage.example/cover.jpg',
	servings: 8,
	prepTimeMinutes: 20,
	cookTimeMinutes: 40,
	notes: 'Keep chilled',
	videoUrl: 'https://youtu.be/abc',
	ingredients: [
		{ id: 'i1', ingredientId: 'b1', name: 'Flour', quantity: 200, unit: 'g', preparation: null, note: null, sortOrder: 0 },
		{ id: 'i2', ingredientId: 'b2', name: 'Salt', quantity: null, unit: null, preparation: null, note: null, sortOrder: 1 },
	],
	instructions: [
		{ id: 's1', stepNumber: 1, description: 'Mix.', imageUrl: 'https://storage.example/s1.jpg' },
		{ id: 's2', stepNumber: 2, description: 'Bake.', imageUrl: null },
		{ id: 's3', stepNumber: 3, description: 'Cool.', imageUrl: 'https://storage.example/s3.jpg' },
	],
})

const editForm = () => <RecipeForm mode="edit" title="Edit Recipe" submitLabel="Save Changes" cancelHref="/recipes/recipe-1" onSave={onSave} initialValues={toRecipeFormValues(recipe)} />
const renderEdit = () => render(<AppToaster>{editForm()}</AppToaster>)
const formElement = () => screen.getByRole('form', { name: 'Edit Recipe' })
const save = () => screen.getByRole('button', { name: /^Save Changes$|^Saving/ })
const image = (name: string, size = 1024) => {
	const file = new File(['x'], name, { type: 'image/png' })
	Object.defineProperty(file, 'size', { value: size })
	return file
}
const metadataOf = (data: FormData) => JSON.parse(data.get('recipe') as string)

it('is titled Edit Recipe with a Save Changes button', () => {
	renderEdit()
	expect(screen.getByRole('heading', { level: 1, name: 'Edit Recipe' })).toBeInTheDocument()
	expect(save()).toBeInTheDocument()
	expect(screen.queryByRole('button', { name: 'Save Recipe' })).not.toBeInTheDocument()
})

it('pre-fills every field and shows the stored photos as current photos', () => {
	renderEdit()
	expect(screen.getByLabelText('Title')).toHaveValue('Layered Cake')
	expect(screen.getByLabelText('Description')).toHaveValue('Sweet and soft.')
	expect(screen.getByRole('button', { name: 'Desserts' })).toHaveAttribute('aria-pressed', 'true')
	expect(screen.getByRole('button', { name: 'Breakfast' })).toHaveAttribute('aria-pressed', 'true')
	expect(screen.getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'false')
	expect(screen.getByLabelText('Prep time in minutes')).toHaveValue('20')
	expect(screen.getByLabelText('Cook time in minutes')).toHaveValue('40')
	expect(screen.getByLabelText('Servings')).toHaveValue('8')
	expect(screen.getByLabelText('Video link')).toHaveValue('https://youtu.be/abc')
	expect(screen.getByPlaceholderText('Tips, substitutions, storage…')).toHaveValue('Keep chilled')

	expect(screen.getByLabelText('Ingredient 1 name')).toHaveValue('Flour')
	expect(screen.getByLabelText('Ingredient 1 amount')).toHaveValue('200')
	expect(screen.getByLabelText('Ingredient 1 unit').querySelector('[data-slot="select-value"]')).toHaveTextContent(/^g$/)
	expect(screen.getByLabelText('Ingredient 2 name')).toHaveValue('Salt')
	expect(screen.getByLabelText('Ingredient 2 amount')).toBeDisabled()
	expect(screen.getByLabelText('Ingredient 2 unit')).toHaveTextContent('to taste')
	expect(screen.getByLabelText('Step 1 instructions')).toHaveValue('Mix.')
	expect(screen.getByLabelText('Step 2 instructions')).toHaveValue('Bake.')
	expect(screen.getByLabelText('Step 3 instructions')).toHaveValue('Cool.')

	expect(screen.getByAltText('Current cover photo')).toHaveAttribute('src', 'https://storage.example/cover.jpg')
	expect(screen.getByAltText('Current photo for step 1')).toHaveAttribute('src', 'https://storage.example/s1.jpg')
	expect(screen.getByAltText('Current photo for step 3')).toHaveAttribute('src', 'https://storage.example/s3.jpg')
	expect(screen.getAllByText('Current photo')).toHaveLength(3)
	expect(screen.getByRole('button', { name: 'Remove cover photo' })).toBeInTheDocument()
	expect(screen.getByLabelText('Replace cover photo')).toBeInTheDocument()
	expect(screen.getByLabelText('Add photo to step 2')).toBeInTheDocument()
})

it('saves an untouched recipe as "keep" for every stored photo and uploads nothing', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderEdit()
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())

	const data = onSave.mock.calls[0][0]
	expect(metadataOf(data)).toMatchObject({
		title: 'Layered Cake', categories: ['Desserts', 'Breakfast'], cover: 'keep',
		ingredients: [{ name: 'Flour', quantity: 200, unit: 'g' }, { name: 'Salt', quantity: null, unit: null }],
		instructions: [{ id: 's1', description: 'Mix.', image: 'keep' }, { id: 's2', description: 'Bake.', image: 'remove' }, { id: 's3', description: 'Cool.', image: 'keep' }],
	})
	expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
})

it('leaves an untouched form for the recipe page without asking', async () => {
	const user = userEvent.setup()
	renderEdit()
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
	expect(router.push).toHaveBeenCalledWith('/recipes/recipe-1')
})

it('replaces a stored step photo with a picked file and uploads only that file', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderEdit()
	await user.upload(screen.getByLabelText('Replace photo for step 1'), image('fresh.png', 2048))
	expect(await screen.findByText('fresh.png · 2 KB')).toBeInTheDocument()
	expect(screen.queryByAltText('Current photo for step 1')).not.toBeInTheDocument()

	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	const data = onSave.mock.calls[0][0]
	expect(metadataOf(data).instructions.map((step: { image: string }) => step.image)).toEqual(['replace', 'remove', 'keep'])
	expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe', 'step-0'])
	expect((data.get('step-0') as File).name).toBe('fresh.png')
})

it('removes the stored cover and a stored step photo', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderEdit()
	await user.click(screen.getByRole('button', { name: 'Remove cover photo' }))
	await user.click(screen.getByRole('button', { name: 'Remove photo from step 3' }))
	expect(screen.getByLabelText('Add cover photo')).toBeInTheDocument()
	expect(screen.getByLabelText('Add photo to step 3')).toBeInTheDocument()

	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(metadataOf(onSave.mock.calls[0][0])).toMatchObject({ cover: 'remove', instructions: [{ image: 'keep' }, { image: 'remove' }, { image: 'remove' }] })
	expect([...onSave.mock.calls[0][0].keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
})

it('replaces the stored cover and keeps the rest', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderEdit()
	await user.upload(screen.getByLabelText('Replace cover photo'), image('new-cover.png'))
	await screen.findByText(/new-cover\.png/)
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(metadataOf(onSave.mock.calls[0][0]).cover).toBe('replace')
	expect([...onSave.mock.calls[0][0].keys()].sort()).toEqual(['cover', 'idempotencyKey', 'recipe'])
})

it('notices an image-only change: Cancel asks first and unloading warns', async () => {
	const user = userEvent.setup()
	renderEdit()
	const unload = () => {
		const event = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(event)
		return event.defaultPrevented
	}
	expect(unload()).toBe(false)
	await user.click(screen.getByRole('button', { name: 'Remove cover photo' }))
	expect(unload()).toBe(true)
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeInTheDocument()
	expect(router.push).not.toHaveBeenCalled()
})

it('notices a replaced photo as a change too', async () => {
	const user = userEvent.setup()
	renderEdit()
	await user.upload(screen.getByLabelText('Replace photo for step 3'), image('again.png'))
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	expect(await screen.findByRole('alertdialog', { name: 'Discard changes?' })).toBeInTheDocument()
})

it('notices a step moved without any text change, and a move back is no change', async () => {
	const user = userEvent.setup()
	renderEdit()
	await user.click(screen.getByRole('button', { name: 'Move step 2 up' }))
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	await screen.findByRole('alertdialog', { name: 'Discard changes?' })
	await user.click(screen.getByRole('button', { name: 'Keep editing' }))
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())

	await user.click(screen.getByRole('button', { name: 'Move step 1 down' }))
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	expect(router.push).toHaveBeenCalledWith('/recipes/recipe-1')
})

it('keeps a stored photo with its step when steps are reordered and numbers a replacement by its final position', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderEdit()
	await user.click(screen.getByRole('button', { name: 'Move step 3 up' }))
	expect(screen.getByLabelText('Step 2 instructions')).toHaveValue('Cool.')
	expect(screen.getByAltText('Current photo for step 2')).toHaveAttribute('src', 'https://storage.example/s3.jpg')
	expect(screen.getByLabelText('Add photo to step 3')).toBeInTheDocument()
	await user.upload(screen.getByLabelText('Replace photo for step 1'), image('mix.png'))
	await screen.findByText(/mix\.png/)

	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	const data = onSave.mock.calls[0][0]
	expect(metadataOf(data).instructions).toEqual([
		{ id: 's1', description: 'Mix.', image: 'replace' },
		{ id: 's3', description: 'Cool.', image: 'keep' },
		{ id: 's2', description: 'Bake.', image: 'remove' },
	])
	expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe', 'step-0'])
})

it('sends a new step without an id and with its new photo, and drops a deleted step', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderEdit()
	await user.click(screen.getByRole('button', { name: 'Remove step 1' }))
	await user.click(screen.getByRole('button', { name: 'Add step' }))
	await user.keyboard('Decorate.')
	await user.upload(screen.getByLabelText('Add photo to step 3'), image('decorate.png'))
	await screen.findByText(/decorate\.png/)

	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	const data = onSave.mock.calls[0][0]
	expect(metadataOf(data).instructions).toEqual([
		{ id: 's2', description: 'Bake.', image: 'remove' },
		{ id: 's3', description: 'Cool.', image: 'keep' },
		{ id: null, description: 'Decorate.', image: 'replace' },
	])
	expect((data.get('step-2') as File).name).toBe('decorate.png')
})

it('keeps the slot as kept and shows a placeholder when a stored preview can no longer load', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderEdit()
	// Optimizer, optimizer retry, then the direct URL: the placeholder appears only after all three fail.
	for (let attempt = 0; attempt < 3; attempt++) fireEvent.error(screen.getByAltText('Current cover photo'))

	expect(await screen.findByRole('img', { name: 'Current cover photo (preview unavailable)' })).toBeInTheDocument()
	expect(screen.getAllByText('Current photo')).toHaveLength(3)
	expect(screen.getByRole('button', { name: 'Remove cover photo' })).toBeEnabled()
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(metadataOf(onSave.mock.calls[0][0]).cover).toBe('keep')
})

it('toasts the update failure message and keeps the inline alert', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'Couldn’t update recipe. Try again.' })
	renderEdit()
	await user.click(save())

	expect(await within(formElement()).findByRole('alert')).toHaveTextContent('Couldn’t update recipe. Try again.')
	const toasts = screen.getAllByRole('alert').filter((element) => !formElement().contains(element))
	expect(toasts.map((toast) => toast.textContent)).toContain('Couldn’t update recipe. Try again.')
})

it('tells the user when the recipe no longer exists, in the alert and the toast', async () => {
	const user = userEvent.setup()
	const message = 'This recipe no longer exists, so your changes can’t be saved.'
	onSave.mockResolvedValue({ status: 'not-found', message })
	renderEdit()
	await user.click(save())

	expect(await within(formElement()).findByRole('alert')).toHaveTextContent(message)
	const toasts = screen.getAllByRole('alert').filter((element) => !formElement().contains(element))
	expect(toasts.map((toast) => toast.textContent)).toContain(message)
	expect(within(formElement()).queryByRole('button', { name: 'Retry save' })).not.toBeInTheDocument()
})

it('reuses the submission key for an unchanged retry but not after an image change', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'unknown', message: 'We couldn’t confirm that the recipe was updated.' })
	renderEdit()
	await user.click(save())
	await within(formElement()).findByRole('alert')
	await waitFor(() => expect(save()).toBeEnabled())
	await user.click(within(formElement()).getByRole('button', { name: 'Retry save' }))
	await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
	expect(onSave.mock.calls[1][0].get('idempotencyKey')).toBe(onSave.mock.calls[0][0].get('idempotencyKey'))

	// Photo controls are disabled while a save is in flight.
	await waitFor(() => expect(screen.getByRole('button', { name: 'Remove cover photo' })).toBeEnabled())
	await user.click(screen.getByRole('button', { name: 'Remove cover photo' }))
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledTimes(3))
	expect(onSave.mock.calls[2][0].get('idempotencyKey')).not.toBe(onSave.mock.calls[0][0].get('idempotencyKey'))
})

it('maps update field errors for steps and photos onto their rows', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({
		status: 'invalid', message: 'Check the highlighted fields and try again.',
		fieldErrors: { 'instructions.1.description': ['Too long.'], 'instructions.0.image': ['Cannot keep this photo.'], 'instructions.2.id': ['Unknown step.'] },
	})
	renderEdit()
	await user.click(save())
	await waitFor(() => expect(screen.getByLabelText('Step 1 instructions')).toBeInTheDocument())
	await waitFor(() => expect(screen.getByLabelText('Step 2 instructions')).toHaveAccessibleDescription('Too long.'))
	expect(screen.getByLabelText('Replace photo for step 1')).toHaveAccessibleDescription('Cannot keep this photo.')
	expect(within(within(formElement()).getByRole('alert')).getByText('Unknown step.')).toBeInTheDocument()
})

// Cache Components keeps a page mounted but hidden when the user leaves it; Activity is how React does that.
function hiddenAndBack(mode: 'create' | 'edit') {
	const form = mode === 'edit'
		? editForm()
		: <RecipeForm mode="create" title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={onSave} />
	const view = render(<AppToaster><Activity mode="visible">{form}</Activity></AppToaster>)
	const toggle = (visible: boolean) => view.rerender(<AppToaster><Activity mode={visible ? 'visible' : 'hidden'}>{form}</Activity></AppToaster>)
	return { leave: () => toggle(false), returnTo: () => toggle(true) }
}

it.each([
	['edit', 'Edit Recipe', 'Layered Cake'],
	['create', 'Create Recipe', ''],
] as const)('starts a returning %s visit from the opening values once the changes were discarded', async (mode, name, opening) => {
	const user = userEvent.setup()
	const { leave, returnTo } = hiddenAndBack(mode)
	await user.type(screen.getByLabelText('Title'), ' extra')
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
	expect(router.push).toHaveBeenCalled()

	leave()
	returnTo()
	expect(screen.getByRole('form', { name })).toBeInTheDocument()
	expect(screen.getByLabelText('Title')).toHaveValue(opening)
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

it('keeps an unsaved draft when the user leaves without discarding, then returns', async () => {
	const user = userEvent.setup()
	const { leave, returnTo } = hiddenAndBack('edit')
	await user.type(screen.getByLabelText('Title'), ' extra')
	leave()
	returnTo()
	expect(screen.getByLabelText('Title')).toHaveValue('Layered Cake extra')
})

it('forgets a discarded image-only change too', async () => {
	const user = userEvent.setup()
	const { leave, returnTo } = hiddenAndBack('edit')
	await user.click(screen.getByRole('button', { name: 'Remove cover photo' }))
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
	leave()
	returnTo()
	expect(screen.getByAltText('Current cover photo')).toBeInTheDocument()
})
