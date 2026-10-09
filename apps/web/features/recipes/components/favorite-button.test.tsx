import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import type { FavoriteResult } from '../actions/results'
import { FavoriteButton } from './favorite-button'

const action = vi.hoisted(() => ({ setFavorite: vi.fn<(id: string, favorite: boolean) => Promise<FavoriteResult>>() }))
vi.mock('../actions/favorite', () => action)

// The favorite state is shared by recipe id for the whole session, so each test uses its own recipe.
let counter = 0
let id = ''
beforeEach(() => {
	action.setFavorite.mockReset()
	id = `recipe-${++counter}`
})

const renderButton = (isFavorite = false, recipeId = id) => render(<AppToaster><FavoriteButton recipeId={recipeId} title="Tomato Soup" isFavorite={isFavorite} /></AppToaster>)
const heart = (favorite: boolean) => screen.getByRole('button', { name: favorite ? 'Remove Tomato Soup from favorites' : 'Add Tomato Soup to favorites' })

it('names the action after the recipe and reflects the saved state', () => {
	const view = renderButton(false)
	expect(heart(false)).toHaveAttribute('aria-pressed', 'false')
	view.unmount()
	renderButton(true, `${id}-saved`)
	expect(heart(true)).toHaveAttribute('aria-pressed', 'true')
})

it('toggles at once and keeps the new state once the save is confirmed', async () => {
	const user = userEvent.setup()
	let confirm!: (result: FavoriteResult) => void
	action.setFavorite.mockImplementation(() => new Promise((resolve) => { confirm = resolve }))
	renderButton(false)

	await user.click(heart(false))
	expect(heart(true)).toHaveAttribute('aria-pressed', 'true')
	expect(action.setFavorite).toHaveBeenCalledWith(id, true)
	confirm({ ok: true })
	await waitFor(() => expect(heart(true)).toBeInTheDocument())
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()

	action.setFavorite.mockResolvedValue({ ok: true })
	await user.click(heart(true))
	expect(action.setFavorite).toHaveBeenLastCalledWith(id, false)
	expect(heart(false)).toHaveAttribute('aria-pressed', 'false')
})

it('reverts and toasts an error when the save fails', async () => {
	const user = userEvent.setup()
	action.setFavorite.mockResolvedValue({ ok: false, reason: 'failed' })
	renderButton(false)
	await user.click(heart(false))
	expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save favorite. Try again.')
	expect(heart(false)).toHaveAttribute('aria-pressed', 'false')
})

it('reverts and toasts an error when the action itself rejects', async () => {
	const user = userEvent.setup()
	action.setFavorite.mockRejectedValue(new Error('Failed to find Server Action'))
	renderButton(true)
	await user.click(heart(true))
	expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save favorite. Try again.')
	expect(heart(true)).toHaveAttribute('aria-pressed', 'true')
})

it('asks the user to sign in again when the session has expired and reverts', async () => {
	const user = userEvent.setup()
	action.setFavorite.mockResolvedValue({ ok: false, reason: 'session-expired' })
	renderButton(false)
	await user.click(heart(false))
	expect(await screen.findByRole('alert')).toHaveTextContent('Your session has expired. Sign in again to save favorites.')
	expect(heart(false)).toBeInTheDocument()
})

it('says so, and reverts, when the recipe no longer exists', async () => {
	const user = userEvent.setup()
	action.setFavorite.mockResolvedValue({ ok: false, reason: 'not-found' })
	renderButton(false)
	await user.click(heart(false))
	expect(await screen.findByRole('alert')).toHaveTextContent('This recipe no longer exists.')
	expect(heart(false)).toBeInTheDocument()
})

it('ignores clicks while a save is in flight so rapid double clicks cannot desynchronise', async () => {
	const user = userEvent.setup()
	let confirm!: (result: FavoriteResult) => void
	action.setFavorite.mockImplementation(() => new Promise((resolve) => { confirm = resolve }))
	renderButton(false)

	await user.click(heart(false))
	await user.click(heart(true))
	await user.click(heart(true))
	expect(action.setFavorite).toHaveBeenCalledOnce()
	expect(heart(true)).toBeInTheDocument()

	confirm({ ok: true })
	action.setFavorite.mockResolvedValue({ ok: true })
	await waitFor(() => expect(heart(true)).toBeInTheDocument())
	await user.click(heart(true))
	await waitFor(() => expect(action.setFavorite).toHaveBeenCalledTimes(2))
	expect(action.setFavorite).toHaveBeenLastCalledWith(id, false)
})

it('keeps every heart for the same recipe in agreement, even one that was rendered earlier with a stale value', async () => {
	const user = userEvent.setup()
	action.setFavorite.mockResolvedValue({ ok: true })
	render(
		<AppToaster>
			<FavoriteButton recipeId={id} title="Tomato Soup" isFavorite={false} />
			<FavoriteButton recipeId={id} title="Tomato Soup" isFavorite={false} />
		</AppToaster>,
	)
	await user.click(screen.getAllByRole('button', { name: 'Add Tomato Soup to favorites' })[0])
	expect(screen.getAllByRole('button', { name: 'Remove Tomato Soup from favorites' })).toHaveLength(2)
})

it('shows a confirmed change on a page that is rendered later from older server data', async () => {
	const user = userEvent.setup()
	action.setFavorite.mockResolvedValue({ ok: true })
	const first = renderButton(false)
	await user.click(heart(false))
	await waitFor(() => expect(action.setFavorite).toHaveBeenCalled())
	first.unmount()

	renderButton(false)
	expect(heart(true)).toHaveAttribute('aria-pressed', 'true')
})
