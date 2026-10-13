import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { redirect } from 'next/navigation'
import { Component, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { ResetPasswordForm } from './reset-password-form'

const actions = vi.hoisted(() => ({ resetPassword: vi.fn() }))
vi.mock('./actions', () => actions)
beforeEach(() => { vi.resetAllMocks() })

/** Stands in for the Next router receiving a successful action's redirect. */
class Redirected extends Component<{ children: ReactNode }, { done: boolean }> {
	state = { done: false }
	static getDerivedStateFromError() { return { done: true } }
	render() { return this.state.done ? <p>Redirected</p> : this.props.children }
}

it('preserves the Next redirect from a successful action', async () => {
	const user = userEvent.setup()
	let redirectError: unknown
	try { redirect('/?notice=password-reset') } catch (error) { redirectError = error }
	actions.resetPassword.mockRejectedValue(redirectError)
	vi.spyOn(console, 'error').mockImplementation(() => {})
	render(<Redirected><ResetPasswordForm token="test-only-link-value" /></Redirected>)
	await user.type(screen.getByLabelText('New password'), 'x'.repeat(16))
	await user.click(screen.getByRole('button', { name: 'Update password' }))
	expect(await screen.findByText('Redirected')).toBeInTheDocument()
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('announces pending submission and disables the submit button until the answer', async () => {
	const user = userEvent.setup()
	let finish!: (value: unknown) => void
	actions.resetPassword.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
	render(<ResetPasswordForm token="test-only-link-value" />)
	await user.type(screen.getByLabelText('New password'), 'x'.repeat(16))
	await user.click(screen.getByRole('button', { name: 'Update password' }))
	await waitFor(() => expect(screen.getByRole('button', { name: 'Updating password...' })).toBeDisabled())
	finish({ ok: false, code: 'SERVICE_UNAVAILABLE', message: 'We could not update your password. Please try again.' })
	await screen.findByRole('alert')
	await waitFor(() => expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled())
})

it.each([
	['rate limit', () => Promise.resolve({ ok: false, code: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' }), 'Too many attempts. Please wait and try again.'],
	['service', () => Promise.resolve({ ok: false, code: 'SERVICE_UNAVAILABLE', message: 'We could not update your password. Please try again.' }), 'We could not update your password. Please try again.'],
	['thrown call', () => Promise.reject(new Error('Test transport failed')), 'We could not update your password. Please try again.'],
])('reports %s inline and allows another attempt', async (_cause, respond, message) => {
	const user = userEvent.setup()
	actions.resetPassword.mockImplementation(respond)
	render(<ResetPasswordForm token="test-only-link-value" />)
	await user.type(screen.getByLabelText('New password'), 'x'.repeat(16))
	await user.click(screen.getByRole('button', { name: 'Update password' }))
	expect(await screen.findByRole('alert')).toHaveTextContent(message)
	expect(screen.getByRole('button', { name: 'Update password' })).toBeEnabled()
})

it.each([undefined, ''])('shows the expired state for a link without a token (%j) without calling the action', (token) => {
	render(<ResetPasswordForm token={token} />)
	expect(screen.getByText('This link has expired or was already used.')).toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
	expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/')
	expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
	expect(actions.resetPassword).not.toHaveBeenCalled()
})

it('replaces the form with the expired state when the action rejects the link', async () => {
	const user = userEvent.setup()
	actions.resetPassword.mockResolvedValue({ ok: false, code: 'RESET_LINK_INVALID', message: 'This link has expired or was already used.' })
	render(<ResetPasswordForm token="test-only-link-value" />)
	await user.type(screen.getByLabelText('New password'), 'x'.repeat(16))
	await user.click(screen.getByRole('button', { name: 'Update password' }))
	expect(await screen.findByText('This link has expired or was already used.')).toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'Request a new link' })).toHaveAttribute('href', '/forgot-password')
	expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
})

it('toggles password visibility with accessible pressed state', async () => {
	const user = userEvent.setup()
	render(<ResetPasswordForm token="test-only-link-value" />)
	expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password')
	await user.click(screen.getByRole('button', { name: 'Show password' }))
	expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'text')
	expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
	await user.click(screen.getByRole('button', { name: 'Hide password' }))
	expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password')
	expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false')
})

it('shows server password errors inline and focuses the field', async () => {
	const user = userEvent.setup()
	actions.resetPassword.mockResolvedValue({ ok: false, code: 'VALIDATION_FAILED', message: 'Check your details and try again.', fieldErrors: { password: ['Use at most 128 characters.'] } })
	render(<ResetPasswordForm token="test-only-link-value" />)
	await user.type(screen.getByLabelText('New password'), 'x'.repeat(16))
	await user.click(screen.getByRole('button', { name: 'Update password' }))
	await waitFor(() => expect(screen.getByLabelText('New password')).toHaveFocus())
	expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
	expect(screen.getByLabelText('New password')).toHaveAccessibleDescription('12-128 characters Use at most 128 characters.')
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('shows local password errors inline and focuses the field without calling the action', async () => {
	const user = userEvent.setup()
	render(<ResetPasswordForm token="test-only-link-value" />)
	await user.type(screen.getByLabelText('New password'), 'short')
	await user.click(screen.getByRole('button', { name: 'Update password' }))
	await waitFor(() => expect(screen.getByLabelText('New password')).toHaveFocus())
	expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
	expect(screen.getByLabelText('New password')).toHaveAccessibleDescription('12-128 characters Use at least 12 characters.')
	expect(actions.resetPassword).not.toHaveBeenCalled()
})

it('opens without calling the action and submits exactly the token and untrimmed password', async () => {
	const user = userEvent.setup()
	actions.resetPassword.mockResolvedValue({ ok: false, code: 'SERVICE_UNAVAILABLE', message: 'We could not update your password. Please try again.' })
	render(<ResetPasswordForm token="test-only-link-value" />)
	expect(actions.resetPassword).not.toHaveBeenCalled()
	expect(screen.getByLabelText('New password').closest('form')).toHaveAttribute('method', 'post')
	expect(screen.queryByDisplayValue('test-only-link-value')).not.toBeInTheDocument()
	await user.type(screen.getByLabelText('New password'), ` ${'x'.repeat(16)} `)
	await user.click(screen.getByRole('button', { name: 'Update password' }))
	expect(actions.resetPassword).toHaveBeenCalledExactlyOnceWith({ token: 'test-only-link-value', password: ` ${'x'.repeat(16)} ` })
})
