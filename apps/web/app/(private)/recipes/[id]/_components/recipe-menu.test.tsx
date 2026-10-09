import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Component, type ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import type { DeleteResult } from '@/features/recipes/actions/results'
import { RecipeMenu } from './recipe-menu'

const action = vi.hoisted(() => ({ deleteRecipe: vi.fn<(id: string) => Promise<DeleteResult>>() }))
vi.mock('@/features/recipes/actions/delete', () => action)

beforeEach(() => { action.deleteRecipe.mockReset() })
afterEach(() => { vi.restoreAllMocks() })

const renderMenu = (children?: (menu: ReactNode) => ReactNode) => {
	const menu = <RecipeMenu recipeId="recipe-1" title="Tomato Soup" />
	return render(<AppToaster>{children ? children(menu) : menu}</AppToaster>)
}
const trigger = () => screen.getByRole('button', { name: 'More options for Tomato Soup' })

async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>) {
	await user.click(trigger())
	await user.click(await screen.findByRole('menuitem', { name: 'Delete recipe' }))
	return screen.findByRole('alertdialog', { name: 'Delete recipe?' })
}

it('offers Edit recipe as a link to the edit page and Delete recipe as a destructive item', async () => {
	const user = userEvent.setup()
	renderMenu()
	await user.click(trigger())
	expect(await screen.findByRole('menuitem', { name: 'Edit recipe' })).toHaveAttribute('href', '/recipes/recipe-1/edit')
	expect(screen.getByRole('menuitem', { name: 'Delete recipe' })).toHaveAttribute('data-variant', 'destructive')
})

it('asks for confirmation, naming the recipe, and closes the menu behind it', async () => {
	const user = userEvent.setup()
	renderMenu()
	const dialog = await openDeleteDialog(user)

	expect(dialog).toHaveAccessibleDescription('“Tomato Soup” and its photos will be permanently deleted.')
	expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
	expect(within(dialog).getByRole('button', { name: 'Delete recipe' })).toBeInTheDocument()
	await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
	expect(action.deleteRecipe).not.toHaveBeenCalled()
})

it('keeps the recipe and returns focus to the menu button when cancelled', async () => {
	const user = userEvent.setup()
	renderMenu()
	const dialog = await openDeleteDialog(user)
	await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
	expect(action.deleteRecipe).not.toHaveBeenCalled()
	await waitFor(() => expect(trigger()).toHaveFocus())
})

it('also cancels with Escape and returns focus to the menu button', async () => {
	const user = userEvent.setup()
	renderMenu()
	await openDeleteDialog(user)
	await user.keyboard('{Escape}')
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
	await waitFor(() => expect(trigger()).toHaveFocus())
	expect(action.deleteRecipe).not.toHaveBeenCalled()
})

it('disables both buttons, announces progress and ignores Escape while deleting', async () => {
	const user = userEvent.setup()
	let finish!: (result: DeleteResult) => void
	action.deleteRecipe.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
	renderMenu()
	const dialog = await openDeleteDialog(user)
	await user.click(within(dialog).getByRole('button', { name: 'Delete recipe' }))

	expect(action.deleteRecipe).toHaveBeenCalledExactlyOnceWith('recipe-1')
	await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled())
	expect(within(dialog).getByRole('button', { name: 'Deleting…' })).toBeDisabled()
	expect(within(dialog).getByRole('status')).toHaveTextContent('Deleting recipe…')
	await user.keyboard('{Escape}')
	expect(screen.getByRole('alertdialog')).toBeInTheDocument()

	finish({ ok: false, reason: 'failed' })
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
})

it.each([
	['failed', 'Couldn’t delete recipe. Try again.'],
	['session-expired', 'Your session has expired. Sign in again to delete this recipe.'],
] as const)('keeps the recipe, closes the dialog and toasts after a %s delete', async (reason, message) => {
	const user = userEvent.setup()
	action.deleteRecipe.mockResolvedValue({ ok: false, reason })
	renderMenu()
	const dialog = await openDeleteDialog(user)
	await user.click(within(dialog).getByRole('button', { name: 'Delete recipe' }))

	expect(await screen.findByRole('alert')).toHaveTextContent(message)
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
	expect(trigger()).toBeEnabled()
})

it('treats a rejected action as a failed delete', async () => {
	const user = userEvent.setup()
	action.deleteRecipe.mockRejectedValue(new Error('Failed to find Server Action'))
	renderMenu()
	const dialog = await openDeleteDialog(user)
	await user.click(within(dialog).getByRole('button', { name: 'Delete recipe' }))
	expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t delete recipe. Try again.')
})

it('hands a confirmed delete’s redirect to Next instead of reporting a failure, and stays disabled meanwhile', async () => {
	const user = userEvent.setup()
	action.deleteRecipe.mockImplementation(async () => redirect('/recipes?notice=recipe-deleted'))
	class Boundary extends Component<{ children: ReactNode }, { error?: { digest?: string } }> {
		state: { error?: { digest?: string } } = {}
		static getDerivedStateFromError(error: { digest?: string }) { return { error } }
		render() { return this.state.error ? <p>navigating: {this.state.error.digest}</p> : this.props.children }
	}
	vi.spyOn(console, 'error').mockImplementation(() => undefined)
	renderMenu((menu) => <Boundary>{menu}</Boundary>)
	const dialog = await openDeleteDialog(user)
	await user.click(within(dialog).getByRole('button', { name: 'Delete recipe' }))

	expect(await screen.findByText(/navigating: NEXT_REDIRECT/)).toBeInTheDocument()
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
