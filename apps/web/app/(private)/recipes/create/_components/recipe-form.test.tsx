import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SaveRecipeResult } from '../_lib/save-recipe-result'
import { RecipeForm } from './recipe-form'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => router }))

const onSave = vi.fn<(formData: FormData) => Promise<SaveRecipeResult>>()
const revoked: string[] = []

beforeEach(() => {
	vi.resetAllMocks()
	revoked.length = 0
	let counter = 0
	URL.createObjectURL = vi.fn(() => `blob:preview-${++counter}`)
	URL.revokeObjectURL = vi.fn((url: string) => { revoked.push(url) })
})
afterEach(() => { vi.restoreAllMocks() })

function renderForm() {
	return render(<RecipeForm title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={onSave} />)
}
const save = () => screen.getByRole('button', { name: /^Save Recipe$|^Saving/ })
const image = (name: string, size = 1024, type = 'image/jpeg') => {
	const file = new File(['x'], name, { type })
	Object.defineProperty(file, 'size', { value: size })
	return file
}

async function fillMinimum(user: ReturnType<typeof userEvent.setup>) {
	await user.type(screen.getByLabelText('Title'), 'Creamy Garlic Pasta')
	await user.type(screen.getByLabelText('Ingredient 1 name'), 'Spaghetti')
	await user.type(screen.getByLabelText('Ingredient 1 amount'), '200')
	await user.selectOptions(screen.getByLabelText('Ingredient 1 unit'), 'g')
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

it('explains that fractions are not accepted as amounts', async () => {
	const user = userEvent.setup()
	renderForm()
	await fillMinimum(user)
	await user.clear(screen.getByLabelText('Ingredient 1 amount'))
	await user.type(screen.getByLabelText('Ingredient 1 amount'), '1/2')
	await user.click(save())
	expect(await screen.findByText(/Use a decimal such as 0.5/)).toBeInTheDocument()
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
	await user.selectOptions(screen.getByLabelText('Ingredient 1 unit'), 'to taste')
	expect(screen.getByLabelText('Ingredient 1 amount')).toBeDisabled()
	expect(screen.getByLabelText('Ingredient 1 amount')).toHaveValue('')
	await user.selectOptions(screen.getByLabelText('Ingredient 1 unit'), 'g')
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
	expect(await screen.findByText(/boil\.jpg · 1 KB/)).toBeInTheDocument()

	await user.click(screen.getByRole('button', { name: 'Move step 1 down' }))
	expect(screen.getByLabelText('Step 1 instructions')).toHaveValue('Serve')
	expect(screen.getByLabelText('Step 2 instructions')).toHaveValue('Boil')
	expect(screen.getByLabelText('Add photo to step 1')).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Remove photo from step 2' })).toBeInTheDocument()
	expect(screen.getByAltText('Preview of boil.jpg')).toBeInTheDocument()

	await user.upload(screen.getByLabelText('Replace photo for step 2'), image('boil-2.jpg'))
	await screen.findByText(/boil-2\.jpg/)
	await waitFor(() => expect(revoked).toContain('blob:preview-1'))
})

it('shows an inline error for oversized or unsupported photos and keeps the current photo', async () => {
	const user = userEvent.setup({ applyAccept: false })
	renderForm()
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('bacon-closeup.jpg', 7.8 * 1024 * 1024))
	expect(await screen.findByText('bacon-closeup.jpg is 7.8 MB. The limit is 5 MB.')).toBeInTheDocument()
	expect(screen.getByLabelText('Add photo to step 1')).toHaveAttribute('aria-invalid', 'true')
	await user.upload(screen.getByLabelText('Add cover photo'), image('logo.svg', 100, 'image/svg+xml'))
	expect(await screen.findByText('logo.svg is not a JPG, PNG or WebP image.')).toBeInTheDocument()
	await user.upload(screen.getByLabelText('Add cover photo'), image('cover.png', 2 * 1024 * 1024, 'image/png'))
	expect(await screen.findByText(/cover\.png · 2\.0 MB/)).toBeInTheDocument()
	expect(screen.queryByText('logo.svg is not a JPG, PNG or WebP image.')).not.toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: 'Remove cover photo' }))
	expect(screen.getByLabelText('Add cover photo')).toBeInTheDocument()
})

it('sends the normalized recipe, announces saving and ignores a second submit while saving', async () => {
	const user = userEvent.setup()
	let finish!: (result: SaveRecipeResult) => void
	onSave.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
	renderForm()
	await fillMinimum(user)
	await user.upload(screen.getByLabelText('Add photo to step 1'), image('boil.jpg'))
	await user.click(save())
	await waitFor(() => expect(save()).toBeDisabled())
	expect(screen.getByRole('status')).toHaveTextContent('Saving recipe…')
	await user.click(save())
	expect(onSave).toHaveBeenCalledOnce()
	const data = onSave.mock.calls[0][0]
	expect(JSON.parse(data.get('recipe') as string)).toMatchObject({
		title: 'Creamy Garlic Pasta', categories: [], servings: null,
		ingredients: [{ name: 'Spaghetti', quantity: 200, unit: 'g' }], instructions: [{ description: 'Boil the pasta.', hasImage: true }],
	})
	expect((data.get('step-0') as File).name).toBe('boil.jpg')
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
	expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save recipe. Try again.')
	expect(screen.getByLabelText('Title')).toHaveValue('Creamy Garlic Pasta')
	expect(screen.getByLabelText('Ingredient 1 name')).toHaveValue('Spaghetti')
	expect(screen.getByLabelText('Step 1 instructions')).toHaveValue('Boil the pasta.')
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
	await user.click(save())
	const alert = await screen.findByRole('alert')
	await user.click(within(alert).getByRole('button', { name: 'Retry save' }))
	await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
	const [first, second] = onSave.mock.calls.map(([data]) => data)
	expect(second.get('idempotencyKey')).toBe(first.get('idempotencyKey'))
	expect(second.get('recipe')).toBe(first.get('recipe'))
})

it('asks a new key once the user edits after an unknown outcome', async () => {
	const user = userEvent.setup()
	onSave.mockResolvedValue({ status: 'unknown', message: 'We couldn’t confirm that the recipe was saved.' })
	renderForm()
	await fillMinimum(user)
	await user.click(save())
	await screen.findByRole('alert')
	await user.type(screen.getByLabelText('Title'), ' v2')
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
	expect(await screen.findByRole('alert')).toHaveTextContent('Sign in again in another tab')
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
	await user.click(save())
	await waitFor(() => expect(screen.getByLabelText('Ingredient 1 amount')).toHaveFocus())
	expect(screen.getByLabelText('Ingredient 1 amount')).toHaveAccessibleDescription('Too precise.')
	expect(screen.getByLabelText('Step 1 instructions')).toHaveAccessibleDescription('Step is too long.')
	expect(screen.getByLabelText('Replace photo for step 1')).toHaveAccessibleDescription('Photo rejected.')
	expect(within(screen.getByRole('alert')).getByText('Key problem.')).toBeInTheDocument()
})

it('confirms before leaving a dirty form and leaves a clean one straight away', async () => {
	const user = userEvent.setup()
	const confirm = vi.spyOn(window, 'confirm')
	renderForm()
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	expect(confirm).not.toHaveBeenCalled()
	expect(router.push).toHaveBeenCalledWith('/recipes')

	router.push.mockClear()
	await user.type(screen.getByLabelText('Title'), 'Draft')
	confirm.mockReturnValueOnce(false)
	await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0])
	expect(confirm).toHaveBeenCalledOnce()
	expect(router.push).not.toHaveBeenCalled()
	confirm.mockReturnValueOnce(true)
	await user.click(screen.getByRole('button', { name: 'Back' }))
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
	render(<Boundary><RecipeForm title="Create Recipe" submitLabel="Save Recipe" cancelHref="/recipes" onSave={onSave} /></Boundary>)
	await fillMinimum(user)
	await user.click(save())
	expect(await screen.findByText(/navigating: NEXT_REDIRECT/)).toBeInTheDocument()
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
