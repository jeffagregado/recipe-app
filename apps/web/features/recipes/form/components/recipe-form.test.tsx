import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SaveRecipeResult } from '../lib/save-recipe-result'
import type { PhotoUploadResult } from '../lib/photo-upload-result'
import type { PhotoUploader } from '../lib/upload-pending-photo'
import { AppToaster } from '@/components/layout/app-toaster'
import { installFakeCanvas } from '@/test/fake-canvas'
import { RecipeForm } from './recipe-form'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => router }))

const categories = [
	{ id: 'category-breakfast', name: 'Breakfast' },
	{ id: 'category-lunch', name: 'Lunch' },
	{ id: 'category-dinner', name: 'Dinner' },
	{ id: 'category-snacks', name: 'Snacks' },
	{ id: 'category-desserts', name: 'Desserts' },
]

const onSave = vi.fn<(formData: FormData) => Promise<SaveRecipeResult>>()
const uploadPhoto = vi.fn<PhotoUploader>()
const PHOTO_ID = '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70'
/** An upload the test finishes by hand, reporting progress meanwhile. */
function holdUpload() {
	const held: { progress: (percent: number) => void; finish: (result: PhotoUploadResult) => void } = { progress: () => {}, finish: () => {} }
	uploadPhoto.mockImplementationOnce((_file, { onProgress }) => new Promise((resolve) => {
		held.progress = onProgress
		held.finish = resolve
	}))
	return held
}
const revoked: string[] = []
let canvas: ReturnType<typeof installFakeCanvas>

beforeEach(() => {
	vi.resetAllMocks()
	canvas = installFakeCanvas({ unreadable: ['broken.jpg'] })
	uploadPhoto.mockResolvedValue({ status: 'uploaded', id: PHOTO_ID })
	revoked.length = 0
	let counter = 0
	URL.createObjectURL = vi.fn(() => `blob:preview-${++counter}`)
	URL.revokeObjectURL = vi.fn((url: string) => { revoked.push(url) })
})
afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

function renderForm(availableCategories = categories) {
	return render(<AppToaster><RecipeForm categories={availableCategories} mode="create" title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={onSave} onUploadPhoto={uploadPhoto} /></AppToaster>)
}
// The toast region also exposes alerts, so the form's own alert is looked up inside the form.
const formElement = () => screen.getByRole('form', { name: 'Create Recipe' })
const findFormAlert = () => within(formElement()).findByRole('alert')
const save = () => screen.getByRole('button', { name: /^Save Recipe$|^Saving/ })
const image = (name: string, size = 1024, type = 'image/jpeg') => {
	const file = new File(['x'], name, { type })
	Object.defineProperty(file, 'size', { value: size })
	return file
}

/** Picks from the unit dropdown: open it from its trigger, then choose the option by its visible label. */
async function chooseUnit(user: ReturnType<typeof userEvent.setup>, position: number, label: string) {
	await user.click(screen.getByLabelText(`Ingredient ${position} unit`))
	await user.click(await screen.findByRole('option', { name: label }))
}

async function fillMinimum(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText('Title'), 'Creamy Garlic Pasta')
	await user.type(screen.getByLabelText('Ingredient 1 name'), 'Spaghetti')
	await user.type(screen.getByLabelText('Ingredient 1 amount'), '200')
	await chooseUnit(user, 1, 'g')
	await user.type(screen.getByLabelText('Step 1 instructions'), 'Boil the pasta.')
}

it('shows the title, required marks and an empty starting form', () => {
	renderForm()
	expect(screen.getByRole('heading', { level: 1, name: 'Create Recipe' })).toBeInTheDocument()
	expect(screen.getByText('Fields marked * are required')).toBeInTheDocument()
	expect(screen.getByRole('heading', { name: /Ingredients/ })).toBeInTheDocument()
	expect(screen.getByLabelText('Ingredient 1 name')).toHaveValue('')
	expect(screen.getByLabelText('Step 1 instructions')).toHaveValue('')
	expect(screen.getByLabelText('Prep time in minutes')).toHaveValue('')
	expect(screen.getByRole('button', { name: 'Move ingredient 1 up' })).toBeDisabled()
	expect(screen.getByRole('button', { name: 'Move ingredient 1 down' })).toBeDisabled()
})

it('links to Categories without rendering category chips when there are none', () => {
	renderForm([])
	expect(screen.queryByRole('group', { name: 'Category' })).not.toBeInTheDocument()
	expect(screen.getByText(/No categories yet. Add some in/)).toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'Categories' })).toHaveAttribute('href', '/categories')
})

it('reports blank fields inline, focuses the first invalid control and does not save', async () => {
	const user = userEvent.setup()
	renderForm()
	await user.click(save())
	await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus())
	expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true')
	expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Add a title before saving.')
	expect(screen.getByLabelText('Ingredient 1 name')).toHaveAccessibleDescription('Add an ingredient name.')
	expect(screen.getByLabelText('Step 1 instructions')).toHaveAccessibleDescription('Describe this step.')
	expect(onSave).not.toHaveBeenCalled()
})

it('explains a malformed amount inline and focuses it', async () => {
	const user = userEvent.setup()
	renderForm()
	await fillMinimum(user)
	await user.clear(screen.getByLabelText('Ingredient 1 amount'))
	await user.type(screen.getByLabelText('Ingredient 1 amount'), '1/0')
	await user.click(save())
	expect(await screen.findByText('Enter a number such as 1.5, 1/2 or 1 1/2.')).toBeInTheDocument()
	await waitFor(() => expect(screen.getByLabelText('Ingredient 1 amount')).toHaveFocus())
	expect(onSave).not.toHaveBeenCalled()
})

it('disables unselected categories once three are chosen and re-enables them when one is removed', async () => {
	const user = userEvent.setup()
	renderForm()
	for (const name of ['Breakfast', 'Lunch', 'Dinner']) await user.click(screen.getByRole('button', { name }))
	expect(screen.getByText('Choose up to 3 · 3 selected')).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Snacks' })).toBeDisabled()
	expect(screen.getByRole('button', { name: 'Desserts' })).toBeDisabled()
	expect(screen.getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'true')
	await user.click(screen.getByRole('button', { name: 'Lunch' }))
	expect(screen.getByRole('button', { name: 'Snacks' })).toBeEnabled()
	expect(screen.getByText('Choose up to 3 · 2 selected')).toBeInTheDocument()
})

it('clears and disables the amount when the unit is "to taste"', async () => {
	const user = userEvent.setup()
	renderForm()
	await user.type(screen.getByLabelText('Ingredient 1 amount'), '3')
	await chooseUnit(user, 1, 'to taste')
	expect(screen.getByLabelText('Ingredient 1 amount')).toBeDisabled()
	expect(screen.getByLabelText('Ingredient 1 amount')).toHaveValue('')
	await chooseUnit(user, 1, 'g')
	expect(screen.getByLabelText('Ingredient 1 amount')).toBeEnabled()
})

it('adds, reorders and removes ingredient rows by keyboard with sensible focus', async () => {
	const user = userEvent.setup()
	renderForm()
	await user.type(screen.getByLabelText('Ingredient 1 name'), 'Flour')
	await user.click(screen.getByRole('button', { name: 'Add ingredient' }))
	await waitFor(() => expect(screen.getByLabelText('Ingredient 2 name')).toHaveFocus())
	await user.keyboard('Sugar')

	screen.getByRole('button', { name: 'Move ingredient 2 up' }).focus()
	await user.keyboard('{Enter}')
	expect(screen.getByLabelText('Ingredient 1 name')).toHaveValue('Sugar')
	expect(screen.getByLabelText('Ingredient 2 name')).toHaveValue('Flour')
	await waitFor(() => expect(screen.getByRole('button', { name: 'Move ingredient 1 down' })).toHaveFocus())

	screen.getByRole('button', { name: 'Remove ingredient 1' }).focus()
	await user.keyboard('{Enter}')
	expect(screen.queryByLabelText('Ingredient 2 name')).not.toBeInTheDocument()
	expect(screen.getByLabelText('Ingredient 1 name')).toHaveValue('Flour')
	await waitFor(() => expect(screen.getByLabelText('Ingredient 1 name')).toHaveFocus())

	await user.click(screen.getByRole('button', { name: 'Remove ingredient 1' }))
	expect(screen.getByLabelText('Ingredient 1 name')).toHaveValue('')
})

it('keeps a step photo with its step when the step is moved and revokes replaced preview URLs', async () => {
	const user = userEvent.setup()
	renderForm()
	await user.type(screen.getByLabelText('Step 1 instructions'), 'Boil')
	await user.click(screen.getByRole('button', { name: 'Add step' }))
	await user.keyboard('Serve')
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('boil.jpg'))
	expect(await screen.findByText('boil.webp · 1 KB')).toBeInTheDocument()

	await user.click(screen.getByRole('button', { name: 'Move step 1 down' }))
	expect(screen.getByLabelText('Step 1 instructions')).toHaveValue('Serve')
	expect(screen.getByLabelText('Step 2 instructions')).toHaveValue('Boil')
	expect(screen.getByLabelText('Add photo to step 1')).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Remove photo from step 2' })).toBeInTheDocument()
	expect(screen.getByAltText('Preview of boil.webp')).toBeInTheDocument()

	await user.upload(screen.getByLabelText('Replace photo for step 2'), image('boil-2.jpg'))
	await screen.findByText(/boil-2\.webp/)
	await waitFor(() => expect(revoked).toContain('blob:preview-1'))
})

it('hints at the original limit and shows an inline error for oversized, unsupported or unreadable photos, keeping the current photo', async () => {
	const user = userEvent.setup({ applyAccept: false })
	renderForm()
	expect(screen.getByText('JPG, PNG or WebP · up to 25 MB')).toBeInTheDocument()
	expect(screen.getByText('Optional · JPG, PNG or WebP · up to 25 MB')).toBeInTheDocument()
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('bacon-closeup.jpg', 30 * 1024 * 1024))
	expect(await screen.findByText('bacon-closeup.jpg is 30.0 MB. The limit is 25 MB.')).toBeInTheDocument()
	expect(screen.getByLabelText('Add photo to step 1')).toHaveAttribute('aria-invalid', 'true')
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('broken.jpg'))
	expect(await screen.findByText('broken.jpg couldn’t be read as a photo. Choose another one.')).toBeInTheDocument()
	expect(screen.getByLabelText('Add photo to step 1')).toHaveAttribute('aria-invalid', 'true')
	await user.upload(screen.getByLabelText('Add cover photo'), image('logo.svg', 100, 'image/svg+xml'))
	expect(await screen.findByText('logo.svg is not a JPG, PNG or WebP image.')).toBeInTheDocument()
	// A phone-sized original is accepted and shrunk before it is shown.
	await user.upload(screen.getByLabelText('Add cover photo'), image('cover.png', 24 * 1024 * 1024, 'image/png'))
	expect(await screen.findByText('cover.webp · 1 KB')).toBeInTheDocument()
	expect(screen.queryByText('logo.svg is not a JPG, PNG or WebP image.')).not.toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: 'Remove cover photo' }))
	expect(screen.getByLabelText('Add cover photo')).toBeInTheDocument()
})

it('announces a photo being prepared at its slot until it is ready', async () => {
	const user = userEvent.setup()
	renderForm()
	const release = canvas.hold()
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('boil.jpg'))
	expect((await screen.findByText('Preparing photo…')).closest('[role="status"]')).toBeInTheDocument()
	release()
	expect(await screen.findByText('boil.webp · 1 KB')).toBeInTheDocument()
	expect(screen.queryByText('Preparing photo…')).not.toBeInTheDocument()
})

it('waits behind its saving state for a photo still being prepared, so the save includes it', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderForm()
	await fillMinimum(user)
	const release = canvas.hold()
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('boil.jpg'))
	await user.click(save())
	await waitFor(() => expect(save()).toBeDisabled())
	expect(screen.getByText('Saving recipe…')).toBeInTheDocument()
	expect(onSave).not.toHaveBeenCalled()
	release()
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect((onSave.mock.calls[0][0].get('step-0') as File).name).toBe('boil.webp')
})

it('uploads a picked cover once it is prepared and shows its progress on the slot', async () => {
	const user = userEvent.setup()
	const upload = holdUpload()
	renderForm()
	await user.upload(screen.getByLabelText('Add cover photo'), image('cover.jpg'))
	expect(await screen.findByText('Uploading photo…')).toBeInTheDocument()
	expect(uploadPhoto.mock.calls[0][0].name).toBe('cover.webp')
	upload.progress(40)
	await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Cover photo upload' })).toHaveAttribute('aria-valuenow', '40'))
	upload.finish({ status: 'uploaded', id: PHOTO_ID })
	await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
	expect(screen.getByText('cover.webp · 1 KB')).toBeInTheDocument()
	expect(screen.queryByText('Uploading photo…')).not.toBeInTheDocument()
})

it('shows a failed cover upload inline with Retry, which uploads the same photo again, and Remove', async () => {
	const user = userEvent.setup()
	uploadPhoto.mockResolvedValueOnce({ status: 'failed', message: 'Couldn’t upload this photo. Try again.' })
	renderForm()
	await user.upload(screen.getByLabelText('Add cover photo'), image('cover.jpg'))
	expect(await screen.findByText('Couldn’t upload this photo. Try again.')).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Remove cover photo' })).toBeEnabled()
	await user.click(screen.getByRole('button', { name: 'Retry cover photo upload' }))
	await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(2))
	expect(uploadPhoto.mock.calls[1][0]).toBe(uploadPhoto.mock.calls[0][0])
	await waitFor(() => expect(screen.queryByText('Couldn’t upload this photo. Try again.')).not.toBeInTheDocument())
	expect(screen.queryByRole('button', { name: 'Retry cover photo upload' })).not.toBeInTheDocument()

	uploadPhoto.mockResolvedValueOnce({ status: 'failed', message: 'Couldn’t upload this photo. Try again.' })
	await user.upload(screen.getByLabelText('Replace cover photo'), image('second.jpg'))
	await screen.findByText('Couldn’t upload this photo. Try again.')
	await user.click(screen.getByRole('button', { name: 'Remove cover photo' }))
	expect(screen.getByLabelText('Add cover photo')).toBeInTheDocument()
	expect(screen.queryByText('Couldn’t upload this photo. Try again.')).not.toBeInTheDocument()
})

it('waits behind its saving state for a cover still uploading, with no other message, then names the Pending photo', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	const upload = holdUpload()
	renderForm()
	await fillMinimum(user)
	await user.upload(screen.getByLabelText('Add cover photo'), image('cover.jpg'))
	await screen.findByText('Uploading photo…')
	await user.click(save())
	await waitFor(() => expect(save()).toBeDisabled())
	expect(screen.getAllByRole('status').map((status) => status.textContent)).toEqual(['Saving recipe…', 'Uploading photo…'])
	expect(onSave).not.toHaveBeenCalled()
	upload.finish({ status: 'uploaded', id: PHOTO_ID })
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	const data = onSave.mock.calls[0][0]
	expect(JSON.parse(data.get('recipe') as string).cover).toEqual({ pendingPhotoId: PHOTO_ID })
	expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
})

it('blocks Save while the cover upload has failed, until it is removed', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	uploadPhoto.mockResolvedValueOnce({ status: 'failed', message: 'Couldn’t upload this photo. Try again.' })
	renderForm()
	await fillMinimum(user)
	await user.upload(screen.getByLabelText('Add cover photo'), image('cover.jpg'))
	await screen.findByText('Couldn’t upload this photo. Try again.')
	await user.click(save())
	await waitFor(() => expect(screen.getByLabelText('Replace cover photo')).toHaveFocus())
	expect(screen.getByLabelText('Replace cover photo')).toHaveAttribute('aria-invalid', 'true')
	expect(onSave).not.toHaveBeenCalled()
	await user.click(screen.getByRole('button', { name: 'Remove cover photo' }))
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(JSON.parse(onSave.mock.calls[0][0].get('recipe') as string)).not.toHaveProperty('cover')
})

it('keeps the uploaded cover after a failed save, so the next attempt names it without uploading again', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'Couldn’t save recipe. Try again.' })
	renderForm()
	await fillMinimum(user)
	await user.upload(screen.getByLabelText('Add cover photo'), image('cover.jpg'))
	await screen.findByText('cover.webp · 1 KB')
	await user.click(save())
	await findFormAlert()
	await waitFor(() => expect(save()).toBeEnabled())
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
	expect(onSave.mock.calls.map(([data]) => JSON.parse(data.get('recipe') as string).cover)).toEqual([{ pendingPhotoId: PHOTO_ID }, { pendingPhotoId: PHOTO_ID }])
	expect(uploadPhoto).toHaveBeenCalledOnce()
})

it('sends the normalized recipe, announces saving and ignores a second submit while saving', async () => {
	const user = userEvent.setup()
	let finish!: (result: SaveRecipeResult) => void
	onSave.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
	renderForm()
	await fillMinimum(user)
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('boil.jpg'))
	await screen.findByText('boil.webp · 1 KB')
	await user.click(save())
	await waitFor(() => expect(save()).toBeDisabled())
	expect(screen.getByRole('status')).toHaveTextContent('Saving recipe…')
	await user.click(save())
	expect(onSave).toHaveBeenCalledOnce()
	const data = onSave.mock.calls[0][0]
	expect(JSON.parse(data.get('recipe') as string)).toMatchObject({
		title: 'Creamy Garlic Pasta', categoryIds: [], servings: null,
		ingredients: [{ name: 'Spaghetti', quantity: 200, unit: 'g' }], instructions: [{ description: 'Boil the pasta.', hasImage: true }],
	})
	// The shrunk photo is sent, not the picked original.
	expect([(data.get('step-0') as File).name, (data.get('step-0') as File).type]).toEqual(['boil.webp', 'image/webp'])
	expect(data.get('idempotencyKey')).toMatch(/^[0-9a-f-]{36}$/)
	finish({ status: 'failed', message: 'Couldn’t save recipe. Try again.' })
	await waitFor(() => expect(save()).toBeEnabled())
})

it('keeps every value after a confirmed failure and uses a new key for the next attempt', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'Couldn’t save recipe. Try again.' })
	renderForm()
	await fillMinimum(user)
	await user.click(save())
	expect(await findFormAlert()).toHaveTextContent('Couldn’t save recipe. Try again.')
	expect(screen.getByLabelText('Title')).toHaveValue('Creamy Garlic Pasta')
	expect(screen.getByLabelText('Ingredient 1 name')).toHaveValue('Spaghetti')
	expect(screen.getByLabelText('Step 1 instructions')).toHaveValue('Boil the pasta.')
	// The alert appears a moment before the pending transition ends; Save ignores clicks until then.
	await waitFor(() => expect(save()).toBeEnabled())
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
	expect(onSave.mock.calls[1][0].get('idempotencyKey')).not.toBe(onSave.mock.calls[0][0].get('idempotencyKey'))
})

it('reuses the same submission key and payload when retrying after an unknown outcome', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValueOnce({ status: 'unknown', message: 'We couldn’t confirm that the recipe was saved.' })
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderForm()
	await fillMinimum(user)
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('boil.jpg'))
	await screen.findByText('boil.webp · 1 KB')
	await user.click(save())
	const alert = await findFormAlert()
	await waitFor(() => expect(within(alert).getByRole('button', { name: 'Retry save' })).toBeEnabled())
	await user.click(within(alert).getByRole('button', { name: 'Retry save' }))
	await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
	const [first, second] = onSave.mock.calls.map(([data]) => data)
	expect(second.get('idempotencyKey')).toBe(first.get('idempotencyKey'))
	expect(second.get('recipe')).toBe(first.get('recipe'))
	// The photo was shrunk once, when it was picked; the retry sends the same file.
	expect(canvas.encodeCount()).toBe(1)
	expect((second.get('step-0') as File).name).toBe('boil.webp')
})

it('asks a new key once the user edits after an unknown outcome', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'unknown', message: 'We couldn’t confirm that the recipe was saved.' })
	renderForm()
	await fillMinimum(user)
	await user.click(save())
	await findFormAlert()
	await user.type(screen.getByLabelText('Title'), ' v2')
	// The alert appears before the pending transition ends, and Save ignores clicks until then; typing is not a wait for that.
	await waitFor(() => expect(save()).toBeEnabled())
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
	expect(onSave.mock.calls[1][0].get('idempotencyKey')).not.toBe(onSave.mock.calls[0][0].get('idempotencyKey'))
})

it('keeps values and explains an expired session', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'session-expired', message: 'Your session has expired. Sign in again in another tab, then come back here and try again.' })
	renderForm()
	await fillMinimum(user)
	await user.click(save())
	expect(await findFormAlert()).toHaveTextContent('Sign in again in another tab')
	expect(screen.getByRole('link', { name: 'Open sign in in a new tab' })).toHaveAttribute('target', '_blank')
	expect(screen.getByLabelText('Title')).toHaveValue('Creamy Garlic Pasta')
})

it('maps server field errors onto their rows and fields, focuses the first and summarises the rest', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({
		status: 'invalid', message: 'Check the highlighted fields and try again.',
		fieldErrors: { 'ingredients.0.quantity': ['Too precise.'], 'instructions.0.description': ['Step is too long.'], 'step-0': ['Photo rejected.'], idempotencyKey: ['Key problem.'] },
	})
	renderForm()
	await fillMinimum(user)
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('boil.jpg'))
	await screen.findByText('boil.webp · 1 KB')
	await user.click(save())
	await waitFor(() => expect(screen.getByLabelText('Ingredient 1 amount')).toHaveFocus())
	expect(screen.getByLabelText('Ingredient 1 amount')).toHaveAccessibleDescription('Too precise.')
	expect(screen.getByLabelText('Step 1 instructions')).toHaveAccessibleDescription('Step is too long.')
	expect(screen.getByLabelText('Replace photo for step 1')).toHaveAccessibleDescription('Photo rejected.')
	expect(within(within(formElement()).getByRole('alert')).getByText('Key problem.')).toBeInTheDocument()
})

it.each([
	['failed', { status: 'failed', message: 'Couldn’t save recipe. Try again.' }],
	['unknown', { status: 'unknown', message: 'We couldn’t confirm that the recipe was saved.' }],
] as const)('toasts "Couldn’t save recipe. Try again." and keeps the inline alert after a %s save', async (_status, result) => {
	const user = userEvent.setup()
	onSave.mockResolvedValue(result)
	renderForm()
	await fillMinimum(user)
	await user.click(save())

	expect(await findFormAlert()).toHaveTextContent(result.message)
	const toasts = screen.getAllByRole('alert').filter((element) => !formElement().contains(element))
	expect(toasts.map((toast) => toast.textContent)).toContain('Couldn’t save recipe. Try again.')
})

it.each([
	['title', 'Title is taken.'],
	['categories', 'A category was removed. Reload the page to see the current list.'],
] as const)('toasts the same message for invalid results while %s errors stay inline', async (field, message) => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'invalid', message: 'Check the highlighted fields and try again.', fieldErrors: { [field]: [message] } })
	renderForm()
	await fillMinimum(user)
	await user.click(save())

	const control = field === 'title' ? screen.getByLabelText('Title') : screen.getByRole('group', { name: 'Category' })
	await waitFor(() => expect(control).toHaveAccessibleDescription(message))
	if (field === 'categories') expect(within(control.parentElement!).getByText(message)).toBeInTheDocument()
	expect(onSave).toHaveBeenCalledOnce()
	expect(router.push).not.toHaveBeenCalled()
	const toasts = screen.getAllByRole('alert').filter((element) => !formElement().contains(element))
	expect(toasts.map((toast) => toast.textContent)).toContain('Couldn’t save recipe. Try again.')
})

it('toasts the session message when the session has expired', async () => {
	const user = userEvent.setup()
	const message = 'Your session has expired. Sign in again in another tab, then come back here and try again.'
	onSave.mockResolvedValue({ status: 'session-expired', message })
	renderForm()
	await fillMinimum(user)
	await user.click(save())

	await findFormAlert()
	const toasts = screen.getAllByRole('alert').filter((element) => !formElement().contains(element))
	expect(toasts.map((toast) => toast.textContent)).toContain(message)
})

it('does not toast for blank fields that fail client-side validation', async () => {
	const user = userEvent.setup()
	renderForm()
	await user.click(save())
	await waitFor(() => expect(screen.getByLabelText('Title')).toHaveFocus())
	expect(screen.queryAllByRole('alert')).toHaveLength(0)
})

it('leaves a clean form straight away without asking', async () => {
	const user = userEvent.setup()
	renderForm()
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
	expect(router.push).toHaveBeenCalledWith('/recipes')
})

it('asks before leaving a dirty form and keeps editing when told to', async () => {
	const user = userEvent.setup()
	renderForm()
	await user.type(screen.getByLabelText('Title'), 'Draft')
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])

	const dialog = await screen.findByRole('alertdialog', { name: 'Discard changes?' })
	expect(dialog).toHaveAccessibleDescription('Your changes to this recipe will be lost.')
	await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
	expect(router.push).not.toHaveBeenCalled()
	expect(screen.getByLabelText('Title')).toHaveValue('Draft')
})

it('keeps editing when the discard question is dismissed with Escape', async () => {
	const user = userEvent.setup()
	renderForm()
	await user.type(screen.getByLabelText('Title'), 'Draft')
	await user.click(screen.getByRole('button', { name: 'Back' }))
	await screen.findByRole('alertdialog', { name: 'Discard changes?' })
	await user.keyboard('{Escape}')
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
	expect(router.push).not.toHaveBeenCalled()
})

it('leaves for the cancel destination once the discard is confirmed', async () => {
	const user = userEvent.setup()
	renderForm()
	await user.type(screen.getByLabelText('Title'), 'Draft')
	await user.click(screen.getByRole('button', { name: 'Back' }))
	await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
	expect(router.push).toHaveBeenCalledWith('/recipes')
})

it('warns about unsaved changes on unload only while the form is dirty', async () => {
	const user = userEvent.setup()
	renderForm()
	const unload = () => {
		const event = new Event('beforeunload', { cancelable: true })
		window.dispatchEvent(event)
		return event.defaultPrevented
	}
	expect(unload()).toBe(false)
	await user.type(screen.getByLabelText('Title'), 'Draft')
	expect(unload()).toBe(true)
})

it('hands a successful save’s redirect to Next instead of reporting a failure, and stays disabled meanwhile', async () => {
	const user = userEvent.setup()
	const { redirect } = await import('next/navigation')
	onSave.mockImplementation(async () => redirect('/recipes/new-id?notice=recipe-saved'))
	class Boundary extends Component<{ children: ReactNode }, { error?: { digest?: string } }> {
		state: { error?: { digest?: string } } = {}
		static getDerivedStateFromError(error: { digest?: string }) { return { error } }
		render() { return this.state.error ? <p>navigating: {this.state.error.digest}</p> : this.props.children }
	}
	vi.spyOn(console, 'error').mockImplementation(() => undefined)
	render(<AppToaster><Boundary><RecipeForm categories={categories} mode="create" title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={onSave} onUploadPhoto={uploadPhoto} /></Boundary></AppToaster>)
	await fillMinimum(user)
	await user.click(save())
	expect(await screen.findByText(/navigating: NEXT_REDIRECT/)).toBeInTheDocument()
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
