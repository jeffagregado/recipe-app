import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChangePasswordInput } from '@recipe-app/contracts/types'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import type { ChangePasswordResult, RequestSetPasswordResult } from '../actions/results'
import { PasswordCard } from './password-card'

vi.mock('../actions/change-password', () => ({ changePassword: vi.fn() }))
vi.mock('../actions/request-set-password', () => ({ requestSetPassword: vi.fn() }))

const onChange = vi.fn<(input: ChangePasswordInput) => Promise<ChangePasswordResult>>()
const onRequestLink = vi.fn<() => Promise<RequestSetPasswordResult>>()
const OLD = 'old password'
const NEW = ' new password 123 '

beforeEach(() => {
	vi.resetAllMocks()
	onChange.mockResolvedValue({ status: 'changed' })
	onRequestLink.mockResolvedValue({ status: 'sent' })
})

const element = (hasPassword: boolean) => <AppToaster><PasswordCard hasPassword={hasPassword} onChange={onChange} onRequestLink={onRequestLink} /></AppToaster>
function renderCard(hasPassword = true) {
	render(element(hasPassword))
	return userEvent.setup()
}
const card = () => screen.getByRole('region', { name: 'Password' })
const current = () => within(card()).getByLabelText('Current password')
const next = () => within(card()).getByLabelText('New password')
const change = () => within(card()).getByRole('button', { name: /^Change password$|^Changing/ })
const emailLink = () => within(card()).getByRole('button', { name: /^Email me a link$|^Sending/ })
async function fill(user: ReturnType<typeof userEvent.setup>, currentPassword = OLD, newPassword = NEW) {
	await user.type(current(), currentPassword)
	await user.type(next(), newPassword)
}

it('shows an Account with a password two masked fields, the sign-out hint and nothing to change yet', () => {
	renderCard()
	expect(within(card()).getByRole('heading', { level: 2, name: 'Password' })).toBeInTheDocument()
	expect(within(card()).getByText('Changing it signs out your other devices.')).toBeInTheDocument()
	expect(current()).toHaveAttribute('type', 'password')
	expect(current()).toHaveAttribute('autocomplete', 'current-password')
	expect(next()).toHaveAttribute('type', 'password')
	expect(next()).toHaveAttribute('autocomplete', 'new-password')
	expect(next()).toHaveAccessibleDescription('12 to 128 characters')
	expect(change()).toBeDisabled()
	expect(within(card()).queryByRole('button', { name: 'Email me a link' })).not.toBeInTheDocument()
})

it('shows an Account without a password no fields, only the way to get a link', () => {
	renderCard(false)
	expect(within(card()).getByRole('heading', { level: 2, name: 'Password' })).toBeInTheDocument()
	expect(within(card()).getByText('No password yet. We’ll email you a link to create one.')).toBeInTheDocument()
	expect(emailLink()).toBeEnabled()
	expect(within(card()).queryByLabelText('Current password')).not.toBeInTheDocument()
	expect(within(card()).queryByLabelText('New password')).not.toBeInTheDocument()
	expect(within(card()).queryByRole('button', { name: 'Change password' })).not.toBeInTheDocument()
	expect(within(card()).queryByText('Changing it signs out your other devices.')).not.toBeInTheDocument()
})

it('switches to the change form once the Account has a password', () => {
	const view = render(element(false))
	view.rerender(element(true))
	expect(current()).toBeInTheDocument()
	expect(within(card()).queryByRole('button', { name: 'Email me a link' })).not.toBeInTheDocument()
})

it('enables Change password only when both fields hold something', async () => {
	const user = renderCard()
	await user.type(current(), OLD)
	expect(change()).toBeDisabled()
	await user.type(next(), 'x')
	expect(change()).toBeEnabled()
	await user.clear(current())
	expect(change()).toBeDisabled()
})

// The password rule belongs to the contract's tests; one rejected value shows where its message goes.
it('puts the error for a rejected new password on that field, focuses it and does not send', async () => {
	const user = renderCard()
	await fill(user, OLD, 'short')
	await user.click(change())
	await waitFor(() => expect(next()).toHaveAccessibleDescription('12 to 128 characters Use at least 12 characters.'))
	expect(next()).toHaveAttribute('aria-invalid', 'true')
	expect(next()).toHaveFocus()
	expect(current()).toHaveAttribute('aria-invalid', 'false')
	expect(onChange).not.toHaveBeenCalled()
})

it('changes the password once with both values untrimmed, announces it in a toast and clears both fields', async () => {
	const user = renderCard()
	await fill(user)
	await user.keyboard('{Enter}')
	await waitFor(() => expect(onChange).toHaveBeenCalledExactlyOnceWith({ currentPassword: OLD, newPassword: NEW }))
	expect(await screen.findByText('Password changed')).toBeInTheDocument()
	await waitFor(() => expect(current()).toHaveValue(''))
	expect(next()).toHaveValue('')
	expect(change()).toBeDisabled()
	expect(current()).toHaveAttribute('aria-invalid', 'false')
	expect(next()).toHaveAttribute('aria-invalid', 'false')
})

it.each([
	['currentPassword', 'Current password is incorrect.', current, next, 'Current password is incorrect.'],
	['newPassword', 'Use at most 128 characters.', next, current, '12 to 128 characters Use at most 128 characters.'],
] as const)('shows a refusal about %s on that field only, focuses it and keeps what was typed', async (field, message, refused, other, description) => {
	onChange.mockResolvedValue({ status: 'invalid', field, message })
	const user = renderCard()
	await fill(user)
	await user.click(change())
	await waitFor(() => expect(refused()).toHaveAccessibleDescription(description))
	await waitFor(() => expect(refused()).toHaveFocus())
	expect(refused()).toHaveAttribute('aria-invalid', 'true')
	expect(other()).toHaveAttribute('aria-invalid', 'false')
	expect(current()).toHaveValue(OLD)
	expect(next()).toHaveValue(NEW)
	expect(change()).toBeEnabled()
	// The toast is rendered and announced, so its text appears more than once.
	expect((await screen.findAllByText('Couldn’t change your password. Try again.')).length).toBeGreaterThan(0)
	expect(screen.queryByText('Password changed')).not.toBeInTheDocument()
	// Correcting the field clears its error.
	await user.type(refused(), '!')
	await waitFor(() => expect(refused()).toHaveAttribute('aria-invalid', 'false'))
})

it.each([
	['session-expired', 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
	['failed', 'Too many attempts. Try again in a few minutes.'],
] as const)('explains a %s change inside the card, keeps both fields and lets the person retry', async (status, message) => {
	onChange.mockResolvedValue({ status, message })
	const user = renderCard()
	await fill(user)
	await user.click(change())
	expect(await within(card()).findByRole('alert')).toHaveTextContent(message)
	expect(current()).toHaveValue(OLD)
	expect(next()).toHaveValue(NEW)
	expect(current()).toHaveAttribute('aria-invalid', 'false')
	expect(change()).toBeEnabled()
	// Editing again clears the stale explanation.
	await user.type(next(), '!')
	expect(within(card()).queryByRole('alert')).not.toBeInTheDocument()
})

it('holds the form while a change is in flight and reports one that threw as a failure', async () => {
	let fail: (reason: Error) => void = () => {}
	onChange.mockReturnValue(new Promise((_resolve, reject) => { fail = reject }))
	const user = renderCard()
	await fill(user)
	await user.click(change())
	await waitFor(() => expect(change()).toHaveTextContent('Changing…'))
	expect(change()).toBeDisabled()
	expect(current()).toHaveAttribute('readonly')
	expect(next()).toHaveAttribute('readonly')
	await user.type(next(), '{Enter}')
	fail(new Error('network'))
	expect(await within(card()).findByRole('alert')).toHaveTextContent('Couldn’t change your password. Try again.')
	expect(onChange).toHaveBeenCalledOnce()
})

it('sends the link once and tells the person to check their inbox, in the card and in a toast', async () => {
	let finish: (result: RequestSetPasswordResult) => void = () => {}
	onRequestLink.mockReturnValue(new Promise((resolve) => { finish = resolve }))
	const user = renderCard(false)
	await user.click(emailLink())
	await waitFor(() => expect(emailLink()).toHaveTextContent('Sending…'))
	expect(emailLink()).toBeDisabled()
	finish({ status: 'sent' })
	expect(await within(card()).findByRole('status')).toHaveTextContent('Check your inbox. We sent a link to create your password. It expires in one hour.')
	expect(await screen.findByText('Link sent')).toBeInTheDocument()
	expect(onRequestLink).toHaveBeenCalledOnce()
	// The first message may be lost, so the person can ask again.
	expect(emailLink()).toBeEnabled()
	expect(within(card()).queryByRole('alert')).not.toBeInTheDocument()
})

it.each([
	['failed', 'You asked for too many emails. Try again in an hour.'],
	['session-expired', 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
] as const)('explains a %s request inside the card and shows no confirmation', async (status, message) => {
	onRequestLink.mockResolvedValueOnce({ status: 'sent' }).mockResolvedValueOnce({ status, message })
	const user = renderCard(false)
	await user.click(emailLink())
	expect(await within(card()).findByRole('status')).toBeInTheDocument()
	await user.click(emailLink())
	expect(await within(card()).findByRole('alert')).toHaveTextContent(message)
	// The earlier confirmation is gone: the latest request sent nothing.
	expect(within(card()).queryByRole('status')).not.toBeInTheDocument()
	expect(emailLink()).toBeEnabled()
})

it('reports a request that threw as a failure', async () => {
	onRequestLink.mockRejectedValue(new Error('network'))
	const user = renderCard(false)
	await user.click(emailLink())
	expect(await within(card()).findByRole('alert')).toHaveTextContent('Couldn’t send the email. Try again.')
})
