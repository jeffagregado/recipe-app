import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CategoryWithUsage, SaveCategoryInput } from '@recipe-app/contracts/types'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import type { SaveCategoriesResult } from '../actions/results'
import { CategoriesForm } from './categories-form'

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => router }))
vi.mock('../actions/save-categories', () => ({ saveCategories: vi.fn() }))

const onSave = vi.fn<(input: SaveCategoryInput[]) => Promise<SaveCategoriesResult>>()
const stored: CategoryWithUsage[] = [
	{ id: 'c1', name: 'Breakfast', recipeCount: 4 }, { id: 'c2', name: 'Lunch', recipeCount: 1 },
	{ id: 'c3', name: 'Snacks', recipeCount: 3 }, { id: 'c4', name: 'Desserts', recipeCount: 0 },
]
const many = (count: number): CategoryWithUsage[] => Array.from({ length: count }, (_, index) => ({ id: `c${index}`, name: `Name ${index}`, recipeCount: 0 }))

beforeEach(() => { vi.resetAllMocks(); onSave.mockResolvedValue({ status: 'saved', categories: null }) })

function renderForm(categories = stored) {
	render(<AppToaster><CategoriesForm categories={categories} onSave={onSave} /></AppToaster>)
	return userEvent.setup()
}
const form = () => screen.getByRole('form', { name: 'Categories' })
const names = () => within(form()).getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)
const nameInput = (position: number) => screen.getByLabelText(`Category ${position} name`)
const save = () => screen.getByRole('button', { name: /^Save( Categories)?$|^Saving/ })
const add = () => screen.getByRole('button', { name: 'Add category' })
const dialog = () => screen.findByRole('alertdialog')

it('lists each category as an editable row with its recipe count and how many of ten are used', () => {
	renderForm()
	expect(screen.getByRole('heading', { level: 1, name: 'Categories' })).toBeInTheDocument()
	expect(names()).toEqual(['Breakfast', 'Lunch', 'Snacks', 'Desserts'])
	expect(screen.getByText('4 of 10', { exact: false })).toBeInTheDocument()
	for (const usage of ['4 recipes', '1 recipe', '3 recipes', '0 recipes']) expect(screen.getByText(usage)).toBeInTheDocument()
})

it('appends an empty focused row marked New, and marks a renamed row', async () => {
	const user = renderForm()
	await user.click(add())
	expect(names()).toEqual(['Breakfast', 'Lunch', 'Snacks', 'Desserts', ''])
	await waitFor(() => expect(nameInput(5)).toHaveFocus())
	expect(screen.getByText('New')).toBeInTheDocument()
	await user.clear(nameInput(3))
	await user.type(nameInput(3), 'Bites')
	expect(screen.getByText('3 recipes · renamed')).toBeInTheDocument()
})

it('disables Add at ten with the reason, and enables it again after a removal', async () => {
	const user = renderForm(many(10))
	expect(add()).toBeDisabled()
	expect(add()).toHaveAccessibleDescription('You’ve reached 10 categories. Remove one to add another.')
	await user.click(screen.getByRole('button', { name: 'Remove Name 9' }))
	expect(add()).toBeEnabled()
	expect(screen.queryByText(/You’ve reached 10 categories/)).not.toBeInTheDocument()
})

it('moves focus to the row that takes a removed row\'s place, and to Add when none is left', async () => {
	const user = renderForm(stored.slice(0, 2))
	await user.click(screen.getByRole('button', { name: 'Remove Breakfast' }))
	await waitFor(() => expect(nameInput(1)).toHaveFocus())
	expect(names()).toEqual(['Lunch'])
	await user.click(screen.getByRole('button', { name: 'Remove Lunch' }))
	await waitFor(() => expect(add()).toHaveFocus())
	expect(screen.getByText('No categories yet. Add one to tag your recipes.')).toBeInTheDocument()
})

it('puts blank, over-long and duplicate names on their own rows, focuses the first and does not save', async () => {
	const user = renderForm()
	await user.clear(nameInput(1))
	await user.clear(nameInput(2))
	await user.type(nameInput(2), 'Elevenses!!')
	await user.click(save())
	await waitFor(() => expect(nameInput(1)).toHaveFocus())
	expect(nameInput(1)).toHaveAccessibleDescription('Enter a category name.')
	expect(nameInput(2)).toHaveAccessibleDescription('Use 10 characters or fewer.')
	expect(nameInput(3)).toHaveAttribute('aria-invalid', 'false')

	await user.type(nameInput(1), 'Brunch')
	await user.clear(nameInput(2))
	await user.type(nameInput(2), ' snacks ')
	await user.click(save())
	// The earlier row keeps the name; the later one is asked to change.
	await waitFor(() => expect(nameInput(3)).toHaveAccessibleDescription('“snacks” already exists. Choose a different name.'))
	expect(names()).toHaveLength(4)
	expect(onSave).not.toHaveBeenCalled()
})

it('saves renames, new rows and the removal of an unused category in one request without asking', async () => {
	const user = renderForm()
	await user.clear(nameInput(2))
	await user.type(nameInput(2), 'Late lunch')
	await user.click(screen.getByRole('button', { name: 'Remove Desserts' }))
	await user.click(add())
	await user.type(nameInput(4), 'Soup')
	await user.click(save())
	await waitFor(() => expect(onSave).toHaveBeenCalledExactlyOnceWith([{ id: 'c1', name: 'Breakfast' }, { id: 'c2', name: 'Late lunch' }, { id: 'c3', name: 'Snacks' }, { name: 'Soup' }]))
	expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
	expect(await screen.findByText('Categories saved')).toBeInTheDocument()
})

it('asks before removing a category that still tags recipes, naming it and the count, then saves on confirmation', async () => {
	const user = renderForm()
	await user.click(screen.getByRole('button', { name: 'Remove Snacks' }))
	await user.click(save())
	const confirmation = await dialog()
	expect(within(confirmation).getByRole('heading', { name: 'Remove “Snacks”?' })).toBeInTheDocument()
	expect(within(confirmation).getByText(/^3 recipes are tagged with it\. They’ll stay, but the tag is removed from them\./)).toBeInTheDocument()
	expect(onSave).not.toHaveBeenCalled()
	await user.click(within(confirmation).getByRole('button', { name: 'Remove and save' }))
	await waitFor(() => expect(onSave).toHaveBeenCalledExactlyOnceWith([{ id: 'c1', name: 'Breakfast' }, { id: 'c2', name: 'Lunch' }, { id: 'c4', name: 'Desserts' }]))
})

it('keeps the categories and saves nothing when the removal is declined', async () => {
	const user = renderForm()
	await user.click(screen.getByRole('button', { name: 'Remove Lunch' }))
	await user.click(screen.getByRole('button', { name: 'Remove Snacks' }))
	await user.click(add())
	await user.type(nameInput(3), 'Soup')
	await user.click(save())
	const confirmation = await dialog()
	expect(within(confirmation).getByRole('heading', { name: 'Remove 2 categories?' })).toBeInTheDocument()
	expect(within(confirmation).getByText(/“Lunch” tags 1 recipe, “Snacks” tags 3 recipes\./)).toBeInTheDocument()
	await user.click(within(confirmation).getByRole('button', { name: 'Keep' }))
	await waitFor(() => expect(names()).toEqual(['Breakfast', 'Lunch', 'Snacks', 'Desserts', 'Soup']))
	expect(onSave).not.toHaveBeenCalled()
})

it('shows a server rejection on its row and keeps what was typed', async () => {
	onSave.mockResolvedValue({ status: 'invalid', message: 'Check the highlighted categories and try again.', fieldErrors: { '1.name': ['“Lunch” already exists. Choose a different name.'] } })
	const user = renderForm()
	await user.type(nameInput(1), '!')
	await user.click(save())
	await waitFor(() => expect(nameInput(2)).toHaveAccessibleDescription('“Lunch” already exists. Choose a different name.'))
	await waitFor(() => expect(nameInput(2)).toHaveFocus())
	expect(names()[0]).toBe('Breakfast!')
	// The toast is rendered and announced, so its text appears more than once.
	expect((await screen.findAllByText('Couldn’t save categories. Try again.')).length).toBeGreaterThan(0)
})

it('tells the user to reload when the list changed in another tab', async () => {
	onSave.mockResolvedValue({ status: 'stale', message: 'Your categories changed in another tab. Reload.' })
	const user = renderForm()
	await user.type(nameInput(1), '!')
	await user.click(save())
	const alert = await within(form()).findByRole('alert')
	expect(alert).toHaveTextContent('Your categories changed in another tab. Reload.')
	expect(within(alert).getByRole('button', { name: 'Reload' })).toBeInTheDocument()
})

it('leaves at once when nothing changed, and confirms before discarding changes', async () => {
	const user = renderForm()
	await user.click(screen.getByRole('button', { name: 'Cancel' }))
	expect(router.push).toHaveBeenCalledExactlyOnceWith('/recipes')
	router.push.mockClear()

	await user.type(nameInput(1), '!')
	await user.click(screen.getByRole('button', { name: 'Cancel' }))
	const confirmation = await dialog()
	expect(router.push).not.toHaveBeenCalled()
	await user.click(within(confirmation).getByRole('button', { name: 'Keep editing' }))
	expect(names()[0]).toBe('Breakfast!')
	await user.click(screen.getByRole('button', { name: 'Back' }))
	await user.click(within(await dialog()).getByRole('button', { name: 'Discard' }))
	expect(router.push).toHaveBeenCalledExactlyOnceWith('/recipes')
})
