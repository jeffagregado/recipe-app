import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SaveRecipeResult } from '../lib/save-recipe-result'
import type { PhotoUploadResult } from '../lib/photo-upload-result'
import type { PhotoDiscarder, PhotoUploader } from '../lib/upload-pending-photo'
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
const discardPhoto = vi.fn<PhotoDiscarder>()
const PHOTO_ID = '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70'
/** An upload the test finishes by hand, reporting progress meanwhile. */
function holdUpload() {
	const held: { progress: (percent: number) => void; finish: (result: PhotoUploadResult) => void } = { progress: () => {}, finish: () => {} }
	uploadPhoto.mockImplementationOnce((_file, { onProgress, signal }) => new Promise((resolve) => {
		held.progress = onProgress
		held.finish = resolve
		// Like the real uploader, an aborted upload settles as failed.
		signal.addEventListener('abort', () => resolve({ status: 'failed', message: 'Couldn’t upload this photo. Try again.' }))
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
	return render(<AppToaster><RecipeForm categories={availableCategories} mode="create" title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={onSave} onUploadPhoto={uploadPhoto} onDiscardPhoto={discardPhoto} /></AppToaster>)
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

it('keeps a photo still being prepared or uploaded with its step while the steps move', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderForm()
	await fillMinimum(user)
	await user.click(screen.getByRole('button', { name: 'Add step' }))
	await user.keyboard('Serve')
	const release = canvas.hold()
	const upload = holdUpload()
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('boil.jpg'))
	await screen.findByText('Preparing photo…')
	await user.click(screen.getByRole('button', { name: 'Move step 1 down' }))
	expect(screen.getByLabelText('Step 2 instructions')).toHaveValue('Boil the pasta.')
	release()
	// Shrunk after the move, it uploads for the step it was picked for, which is now step 2.
	expect(await screen.findByRole('progressbar', { name: 'Step 2 photo upload' })).toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: 'Move step 2 up' }))
	upload.progress(60)
	await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Step 1 photo upload' })).toHaveAttribute('aria-valuenow', '60'))
	upload.finish({ status: 'uploaded', id: PHOTO_ID })
	expect(await screen.findByText('boil.webp · 1 KB')).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Remove photo from step 1' })).toBeInTheDocument()
	expect(screen.getByLabelText('Add photo to step 2')).toBeInTheDocument()
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(sentRecipe().instructions.map((step: { image?: unknown }) => step.image)).toEqual([{ pendingPhotoId: PHOTO_ID }, undefined])
	expect(uploadPhoto).toHaveBeenCalledOnce()
})

it.each([
	['being prepared', 'Preparing photo…', () => canvas.hold(), []],
	['uploading', 'Uploading photo…', () => { holdUpload(); return () => {} }, [true]],
])('stops a photo still %s when its step is deleted, so it lands on no other step', async (_name, status, hold, aborted) => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	renderForm()
	await fillMinimum(user)
	await user.click(screen.getByRole('button', { name: 'Add step' }))
	await user.keyboard('Serve')
	const release = hold()
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('boil.jpg'))
	await screen.findByText(status)
	await user.click(screen.getByRole('button', { name: 'Remove step 1' }))
	expect(screen.getByLabelText('Step 1 instructions')).toHaveValue('Serve')
	expect(screen.queryByText(status)).not.toBeInTheDocument()
	release()
	// Save waits for the deleted step's photo work to settle, so the payload shows where that photo went.
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(sentRecipe().instructions).toEqual([{ description: 'Serve', hasImage: false, heading: null }])
	expect(uploadPhoto.mock.calls.map(([, { signal }]) => signal.aborted)).toEqual(aborted)
	expect(screen.getByLabelText('Add photo to step 1')).toBeInTheDocument()
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

it('waits behind its saving state for a photo still being prepared, so the save names it', async () => {
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
	expect(sentRecipe().instructions[0].image).toEqual({ pendingPhotoId: PHOTO_ID })
})

/** The cover and a step photo slot behave alike; `sent` reads the slot back out of the saved metadata. */
const SLOTS = [
	{ slot: 'the cover', add: 'Add cover photo', replace: 'Replace cover photo', remove: 'Remove cover photo', retry: 'Retry cover photo upload', progress: 'Cover photo upload',
		sent: (recipe: { cover?: unknown }) => recipe.cover },
	{ slot: 'a step', add: 'Add photo to step 1', replace: 'Replace photo for step 1', remove: 'Remove photo from step 1', retry: 'Retry photo upload for step 1', progress: 'Step 1 photo upload',
		sent: (recipe: { instructions: { image?: unknown }[] }) => recipe.instructions[0].image },
] as const
const sentRecipe = (call = 0) => JSON.parse(onSave.mock.calls[call][0].get('recipe') as string)

it.each(SLOTS)('uploads a photo picked for $slot once it is prepared and shows its progress on the slot', async ({ add, progress }) => {
	const user = userEvent.setup()
	const upload = holdUpload()
	renderForm()
	await user.upload(screen.getByLabelText(add), image('photo.jpg'))
	expect(await screen.findByText('Uploading photo…')).toBeInTheDocument()
	// The shrunk photo uploads, not the picked original.
	expect([uploadPhoto.mock.calls[0][0].name, uploadPhoto.mock.calls[0][0].type]).toEqual(['photo.webp', 'image/webp'])
	upload.progress(40)
	await waitFor(() => expect(screen.getByRole('progressbar', { name: progress })).toHaveAttribute('aria-valuenow', '40'))
	upload.finish({ status: 'uploaded', id: PHOTO_ID })
	await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
	expect(screen.getByText('photo.webp · 1 KB')).toBeInTheDocument()
	expect(screen.queryByText('Uploading photo…')).not.toBeInTheDocument()
})

it.each(SLOTS)('shows a failed upload on $slot inline with Retry, which uploads the same photo again, and Remove', async ({ add, replace, remove, retry }) => {
	const user = userEvent.setup()
	uploadPhoto.mockResolvedValueOnce({ status: 'failed', message: 'Couldn’t upload this photo. Try again.' })
	renderForm()
	await user.upload(screen.getByLabelText(add), image('photo.jpg'))
	expect(await screen.findByText('Couldn’t upload this photo. Try again.')).toBeInTheDocument()
	expect(screen.getByRole('button', { name: remove })).toBeEnabled()
	await user.click(screen.getByRole('button', { name: retry }))
	// Retry leaves once it is pressed; focus stays on the slot instead of falling back to the page.
	expect(screen.getByRole('button', { name: remove })).toHaveFocus()
	await waitFor(() => expect(uploadPhoto).toHaveBeenCalledTimes(2))
	expect(uploadPhoto.mock.calls[1][0]).toBe(uploadPhoto.mock.calls[0][0])
	await waitFor(() => expect(screen.queryByText('Couldn’t upload this photo. Try again.')).not.toBeInTheDocument())
	expect(screen.queryByRole('button', { name: retry })).not.toBeInTheDocument()

	uploadPhoto.mockResolvedValueOnce({ status: 'failed', message: 'Couldn’t upload this photo. Try again.' })
	await user.upload(screen.getByLabelText(replace), image('second.jpg'))
	await screen.findByText('Couldn’t upload this photo. Try again.')
	await user.click(screen.getByRole('button', { name: remove }))
	expect(screen.getByLabelText(add)).toBeInTheDocument()
	expect(screen.queryByText('Couldn’t upload this photo. Try again.')).not.toBeInTheDocument()
})

it.each(SLOTS)('waits behind its saving state for $slot still uploading, with no other message, then names the Pending photo', async ({ add, sent }) => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	const upload = holdUpload()
	renderForm()
	await fillMinimum(user)
	await user.upload(screen.getByLabelText(add), image('photo.jpg'))
	await screen.findByText('Uploading photo…')
	await user.click(save())
	await waitFor(() => expect(save()).toBeDisabled())
	expect(screen.getAllByRole('status').map((status) => status.textContent)).toEqual(['Saving recipe…', 'Uploading photo…'])
	expect(onSave).not.toHaveBeenCalled()
	upload.finish({ status: 'uploaded', id: PHOTO_ID })
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(sent(sentRecipe())).toEqual({ pendingPhotoId: PHOTO_ID })
	expect([...onSave.mock.calls[0][0].keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
})

it.each(SLOTS)('blocks Save while the upload on $slot has failed, until it is removed', async ({ add, replace, remove, sent }) => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	uploadPhoto.mockResolvedValueOnce({ status: 'failed', message: 'Couldn’t upload this photo. Try again.' })
	renderForm()
	await fillMinimum(user)
	await user.upload(screen.getByLabelText(add), image('photo.jpg'))
	await screen.findByText('Couldn’t upload this photo. Try again.')
	await user.click(save())
	await waitFor(() => expect(screen.getByLabelText(replace)).toHaveFocus())
	expect(screen.getByLabelText(replace)).toHaveAttribute('aria-invalid', 'true')
	expect(onSave).not.toHaveBeenCalled()
	await user.click(screen.getByRole('button', { name: remove }))
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(sent(sentRecipe())).toBeUndefined()
})

it('saves a recipe with several step photos once, after every upload has finished, naming each step’s own Pending photo', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'failed', message: 'x' })
	const ids = [1, 2, 3].map((n) => `0b0f6a3e-4c1d-4d6e-9f1a-00000000000${n}`)
	const uploads = ids.map(() => holdUpload())
	renderForm()
	await fillMinimum(user)
	for (const step of [2, 3]) {
		await user.click(screen.getByRole('button', { name: 'Add step' }))
		await user.keyboard(`Step ${step}`)
	}
	for (const step of [1, 2, 3]) await user.upload(screen.getByLabelText(`Add photo to step ${step}`), image(`step-${step}.jpg`))
	await waitFor(() => expect(uploadPhoto.mock.calls.map(([file]) => file.name)).toEqual(['step-1.webp', 'step-2.webp', 'step-3.webp']))
	await user.click(save())
	await waitFor(() => expect(save()).toBeDisabled())
	// Answered out of order; the save still waits for the last one.
	uploads[2].finish({ status: 'uploaded', id: ids[2] })
	uploads[0].finish({ status: 'uploaded', id: ids[0] })
	await waitFor(() => expect(screen.getAllByRole('progressbar')).toHaveLength(1))
	expect(onSave).not.toHaveBeenCalled()
	uploads[1].finish({ status: 'uploaded', id: ids[1] })
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	expect(sentRecipe().instructions.map((step: { image?: unknown }) => step.image)).toEqual(ids.map((pendingPhotoId) => ({ pendingPhotoId })))
	expect([...onSave.mock.calls[0][0].keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
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
	expect(discardPhoto).not.toHaveBeenCalled()
})

const SECOND_ID = '0b0f6a3e-4c1d-4d6e-9f1a-000000000002'

it.each(SLOTS)('discards the Pending photo on $slot once another photo replaces it, and that one once it is removed', async ({ add, replace, remove }) => {
	const user = userEvent.setup()
	uploadPhoto.mockResolvedValueOnce({ status: 'uploaded', id: PHOTO_ID }).mockResolvedValueOnce({ status: 'uploaded', id: SECOND_ID })
	renderForm()
	await user.upload(screen.getByLabelText(add), image('first.jpg'))
	await screen.findByText('first.webp · 1 KB')
	expect(discardPhoto).not.toHaveBeenCalled()
	await user.upload(screen.getByLabelText(replace), image('second.jpg'))
	await screen.findByText('second.webp · 1 KB')
	expect(discardPhoto.mock.calls).toEqual([[PHOTO_ID]])
	await user.click(screen.getByRole('button', { name: remove }))
	expect(discardPhoto.mock.calls).toEqual([[PHOTO_ID], [SECOND_ID]])
})

it('keeps the Pending photo when the photo picked to replace it is refused', async () => {
	const user = userEvent.setup({ applyAccept: false })
	renderForm()
	await user.upload(screen.getByLabelText('Add cover photo'), image('cover.jpg'))
	await screen.findByText('cover.webp · 1 KB')
	await user.upload(screen.getByLabelText('Replace cover photo'), image('logo.gif', 1024, 'image/gif'))
	expect(await screen.findByText(/not a JPG, PNG or WebP image/)).toBeInTheDocument()
	expect(screen.getByText('cover.webp · 1 KB')).toBeInTheDocument()
	expect(discardPhoto).not.toHaveBeenCalled()
})

it('discards a step’s Pending photo when the step is deleted', async () => {
	const user = userEvent.setup()
	renderForm()
	await user.click(screen.getByRole('button', { name: 'Add step' }))
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('boil.jpg'))
	await screen.findByText('boil.webp · 1 KB')
	await user.click(screen.getByRole('button', { name: 'Remove step 1' }))
	expect(discardPhoto.mock.calls).toEqual([[PHOTO_ID]])
})

it('discards a photo whose upload finishes after the photo was removed', async () => {
	const user = userEvent.setup()
	// The API stored the photo before the abort reached it.
	let finish: (result: PhotoUploadResult) => void = () => {}
	uploadPhoto.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
	renderForm()
	await user.upload(screen.getByLabelText('Add cover photo'), image('cover.jpg'))
	await screen.findByText('Uploading photo…')
	await user.click(screen.getByRole('button', { name: 'Remove cover photo' }))
	expect(discardPhoto).not.toHaveBeenCalled()
	finish({ status: 'uploaded', id: PHOTO_ID })
	await waitFor(() => expect(discardPhoto.mock.calls).toEqual([[PHOTO_ID]]))
	expect(screen.getByLabelText('Add cover photo')).toBeInTheDocument()
})

/** A cover and a step photo, uploaded as two Pending photos. */
async function uploadTwoPhotos(user: ReturnType<typeof userEvent.setup>) {
	uploadPhoto.mockResolvedValueOnce({ status: 'uploaded', id: PHOTO_ID }).mockResolvedValueOnce({ status: 'uploaded', id: SECOND_ID })
	await user.upload(screen.getByLabelText('Add cover photo'), image('cover.jpg'))
	await screen.findByText('cover.webp · 1 KB')
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('step.jpg'))
	await screen.findByText('step.webp · 1 KB')
}

it('discards every Pending photo once "Discard changes?" is confirmed, and none while the cook keeps editing', async () => {
	const user = userEvent.setup()
	renderForm()
	await uploadTwoPhotos(user)
	await user.click(screen.getByRole('button', { name: 'Back' }))
	await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Keep editing' }))
	expect(discardPhoto).not.toHaveBeenCalled()
	await user.click(screen.getByRole('button', { name: 'Back' }))
	await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
	expect(discardPhoto.mock.calls.flat().sort()).toEqual([PHOTO_ID, SECOND_ID].sort())
	expect(router.push).toHaveBeenCalledWith('/recipes')
})

const hidePage = (persisted: boolean) => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted }))

it('discards every Pending photo when the page is closed or reloaded, but not when the browser keeps it to come back to', async () => {
	const user = userEvent.setup()
	renderForm()
	await uploadTwoPhotos(user)
	hidePage(true)
	expect(discardPhoto).not.toHaveBeenCalled()
	hidePage(false)
	expect(discardPhoto.mock.calls.flat().sort()).toEqual([PHOTO_ID, SECOND_ID].sort())
})

it('keeps the Pending photos a save still in flight names when the page is closed', async () => {
	const user = userEvent.setup()
	let finishSave: (result: SaveRecipeResult) => void = () => {}
	onSave.mockReturnValue(new Promise((resolve) => { finishSave = resolve }))
	renderForm()
	await fillMinimum(user)
	await uploadTwoPhotos(user)
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
	hidePage(false)
	expect(discardPhoto).not.toHaveBeenCalled()
	// React keeps every later save pending while this one is, so it must finish.
	finishSave({ status: 'failed', message: 'Couldn’t save recipe. Try again.' })
	await waitFor(() => expect(save()).toBeEnabled())
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
		ingredients: [{ name: 'Spaghetti', quantity: 200, unit: 'g' }], instructions: [{ description: 'Boil the pasta.', hasImage: false, image: { pendingPhotoId: PHOTO_ID } }],
	})
	// The photo was uploaded on its own; the save only names it.
	expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
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
	// The photo was shrunk and uploaded once, when it was picked; the retry names the same Pending photo.
	expect(canvas.encodeCount()).toBe(1)
	expect(uploadPhoto).toHaveBeenCalledOnce()
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
	render(<AppToaster><Boundary><RecipeForm categories={categories} mode="create" title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={onSave} onUploadPhoto={uploadPhoto} onDiscardPhoto={discardPhoto} /></Boundary></AppToaster>)
	await fillMinimum(user)
	await user.click(save())
	expect(await screen.findByText(/navigating: NEXT_REDIRECT/)).toBeInTheDocument()
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
