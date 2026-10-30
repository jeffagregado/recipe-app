import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ConfirmEmailChangeResult } from '../actions/results'
import { ConfirmEmailChangeForm } from './confirm-email-change-form'

vi.mock('../actions/confirm-email-change', () => ({ confirmEmailChange: vi.fn() }))

const onConfirm = vi.fn<(input: { token: string }) => Promise<ConfirmEmailChangeResult>>()
const TOKEN = 't'.repeat(43)
const confirm = () => screen.getByRole('button', { name: /^Confirm email change$|^Confirming/ })
const expectExpired = () => {
	expect(screen.getByRole('alert')).toHaveTextContent('This link has expired or was already used.')
	expect(screen.getByRole('link', { name: 'Back to Settings' })).toHaveAttribute('href', '/settings')
	expect(screen.queryByRole('button')).not.toBeInTheDocument()
}

beforeEach(() => { vi.resetAllMocks() })

it('opens with one button and confirms nothing by itself', () => {
	render(<ConfirmEmailChangeForm token={TOKEN} onConfirm={onConfirm} />)
	expect(confirm()).toBeEnabled()
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	// A mail scanner that opens the link renders this page and stops here.
	expect(onConfirm).not.toHaveBeenCalled()
})

it('posts the token once from the keyboard and holds the button while it is in flight', async () => {
	let finish: (result: ConfirmEmailChangeResult) => void = () => {}
	onConfirm.mockReturnValue(new Promise((resolve) => { finish = resolve }))
	const user = userEvent.setup()
	render(<ConfirmEmailChangeForm token={TOKEN} onConfirm={onConfirm} />)
	confirm().focus()
	await user.keyboard('{Enter}')
	await waitFor(() => expect(confirm()).toHaveTextContent('Confirming…'))
	expect(confirm()).toBeDisabled()
	await user.keyboard('{Enter}')
	expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ token: TOKEN })
	finish({ status: 'failed', message: 'We could not confirm your new email. Please try again.' })
	// Nothing was confirmed, so the same link can be tried again.
	expect(await screen.findByRole('alert')).toHaveTextContent('We could not confirm your new email. Please try again.')
	// The alert appears a moment before the pending transition ends; the button is enabled once it has.
	await waitFor(() => expect(confirm()).toBeEnabled())
})

it('shows a link without a token as expired, with the way back to Settings and nothing to press', () => {
	render(<ConfirmEmailChangeForm onConfirm={onConfirm} />)
	expectExpired()
})

it('replaces the button with the expired state when the link is refused', async () => {
	onConfirm.mockResolvedValue({ status: 'invalid' })
	const user = userEvent.setup()
	render(<ConfirmEmailChangeForm token={TOKEN} onConfirm={onConfirm} />)
	await user.click(confirm())
	await waitFor(expectExpired)
})

it('reports a confirmation that threw as a failure the person can retry', async () => {
	onConfirm.mockRejectedValue(new Error('network'))
	const user = userEvent.setup()
	render(<ConfirmEmailChangeForm token={TOKEN} onConfirm={onConfirm} />)
	await user.click(confirm())
	expect(await screen.findByRole('alert')).toHaveTextContent('We could not confirm your new email. Please try again.')
	expect(confirm()).toBeEnabled()
})
