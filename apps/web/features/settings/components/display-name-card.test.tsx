import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { UpdateDisplayNameInput } from '@recipe-app/contracts/types'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import type { UpdateDisplayNameResult } from '../actions/results'
import { DisplayNameCard } from './display-name-card'

vi.mock('../actions/update-display-name', () => ({ updateDisplayName: vi.fn() }))

const onSave = vi.fn<(input: UpdateDisplayNameInput) => Promise<UpdateDisplayNameResult>>()

beforeEach(() => { vi.resetAllMocks(); onSave.mockResolvedValue({ status: 'saved', displayName: 'Ana Reyes' }) })

function renderCard(displayName = 'Ana María') {
	render(<AppToaster><DisplayNameCard displayName={displayName} onSave={onSave} /></AppToaster>)
	return userEvent.setup()
}
const card = () => screen.getByRole('region', { name: 'Display name' })
const input = () => within(card()).getByRole('textbox', { name: 'Display name' })
const save = () => within(card()).getByRole('button', { name: /^Save name$|^Saving/ })
async function retype(user: ReturnType<typeof userEvent.setup>, value: string) {
	await user.clear(input())
	// Pasted, not typed: 101 keystrokes would take seconds on a busy runner.
	if (value) await user.paste(value)
}

it('shows the saved name with its count of 100 and nothing to save', () => {
	renderCard()
	expect(within(card()).getByRole('heading', { level: 2, name: 'Display name' })).toBeInTheDocument()
	expect(input()).toHaveValue('Ana María')
	expect(within(card()).getByText('9/100')).toBeInTheDocument()
	expect(save()).toBeDisabled()
})

it('enables Save only while the name differs from the saved one, ignoring surrounding spaces', async () => {
	const user = renderCard()
	await user.type(input(), ' ')
	expect(save()).toBeDisabled()
	await user.type(input(), 'R')
	expect(save()).toBeEnabled()
	expect(within(card()).getByText('11/100')).toBeInTheDocument()
	await user.type(input(), '{Backspace}')
	expect(save()).toBeDisabled()
})

it.each([
	['a blank name', '   ', 'Enter a display name.'],
	['101 characters', 'a'.repeat(101), 'Use at most 100 characters.'],
])('puts the error for %s on the field, focuses it and does not save', async (_case, value, message) => {
	const user = renderCard('Ana')
	await retype(user, value)
	await user.click(save())
	await waitFor(() => expect(input()).toHaveAccessibleDescription(message))
	expect(input()).toHaveAttribute('aria-invalid', 'true')
	expect(input()).toHaveFocus()
	expect(onSave).not.toHaveBeenCalled()
})

it('saves the typed name once, announces it in a toast and leaves the stored name with nothing to save', async () => {
	const user = renderCard()
	await retype(user, '  Ana Reyes ')
	await user.keyboard('{Enter}')
	await waitFor(() => expect(onSave).toHaveBeenCalledExactlyOnceWith({ displayName: 'Ana Reyes' }))
	expect(await screen.findByText('Display name saved')).toBeInTheDocument()
	await waitFor(() => expect(input()).toHaveValue('Ana Reyes'))
	expect(save()).toBeDisabled()
	expect(within(card()).getByText('9/100')).toBeInTheDocument()
})

it('holds Save while a save is in flight', async () => {
	let finish: (result: UpdateDisplayNameResult) => void = () => {}
	onSave.mockReturnValue(new Promise((resolve) => { finish = resolve }))
	const user = renderCard()
	await retype(user, 'Ana Reyes')
	await user.click(save())
	await waitFor(() => expect(save()).toHaveTextContent('Saving…'))
	expect(save()).toBeDisabled()
	await user.type(input(), '{Enter}')
	finish({ status: 'saved', displayName: 'Ana Reyes' })
	await waitFor(() => expect(save()).toHaveTextContent('Save name'))
	expect(onSave).toHaveBeenCalledOnce()
})

it('shows a server rejection on the field and keeps what was typed', async () => {
	onSave.mockResolvedValue({ status: 'invalid', message: 'Use at most 100 characters.' })
	const user = renderCard()
	await retype(user, 'Ana Reyes')
	await user.click(save())
	await waitFor(() => expect(input()).toHaveAccessibleDescription('Use at most 100 characters.'))
	await waitFor(() => expect(input()).toHaveFocus())
	expect(input()).toHaveValue('Ana Reyes')
	expect(save()).toBeEnabled()
	// The toast is rendered and announced, so its text appears more than once.
	expect((await screen.findAllByText('Couldn’t save your display name. Try again.')).length).toBeGreaterThan(0)
	expect(screen.queryByText('Display name saved')).not.toBeInTheDocument()
})

it.each([
	['session-expired', 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
	['failed', 'Too many saves. Try again in a moment.'],
] as const)('explains a %s save inside the card, keeps the typed name and lets the person retry', async (status, message) => {
	onSave.mockResolvedValue({ status, message })
	const user = renderCard()
	await retype(user, 'Ana Reyes')
	await user.click(save())
	expect(await within(card()).findByRole('alert')).toHaveTextContent(message)
	expect(input()).toHaveValue('Ana Reyes')
	expect(input()).toHaveAttribute('aria-invalid', 'false')
	expect(save()).toBeEnabled()
	// Editing again clears the stale explanation.
	await user.type(input(), '!')
	expect(within(card()).queryByRole('alert')).not.toBeInTheDocument()
})

it('reports a save that threw as a failure', async () => {
	onSave.mockRejectedValue(new Error('network'))
	const user = renderCard()
	await retype(user, 'Ana Reyes')
	await user.click(save())
	expect(await within(card()).findByRole('alert')).toHaveTextContent('Couldn’t save your display name. Try again.')
})
