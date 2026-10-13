import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { ForgotPasswordForm } from './forgot-password-form'

const actions = vi.hoisted(() => ({ forgotPassword: vi.fn() }))
vi.mock('./actions', () => actions)
beforeEach(() => { vi.resetAllMocks() })

it.each([
	['rate limit', () => Promise.resolve({ ok: false, code: 'RATE_LIMITED', message: 'You asked for too many emails. Please try again later.' }), 'You asked for too many emails. Please try again later.'],
	['thrown call', () => Promise.reject(new Error('Test transport failed')), 'We could not send the email. Please try again.'],
])('shows %s inline and allows another attempt', async (_cause, respond, message) => {
	const user = userEvent.setup()
	actions.forgotPassword.mockImplementation(respond)
	render(<ForgotPasswordForm />)
	await user.type(screen.getByLabelText('Email'), 'owner@example.invalid')
	await user.click(screen.getByRole('button', { name: 'Send reset link' }))
	expect(await screen.findByRole('alert')).toHaveTextContent(message)
	expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled()
})

it('disables submission while sending', async () => {
	const user = userEvent.setup()
	let finish!: (value: unknown) => void
	actions.forgotPassword.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
	render(<ForgotPasswordForm />)
	await user.click(screen.getByRole('button', { name: 'Send reset link' }))
	await waitFor(() => expect(screen.getByRole('button', { name: 'Send reset link' })).toBeDisabled())
	finish({ ok: true })
	await screen.findByRole('status')
})

it('links a rejected email to the field, focuses it and keeps the address', async () => {
	const user = userEvent.setup()
	actions.forgotPassword.mockResolvedValue({ ok: false, code: 'VALIDATION_FAILED', message: 'Check your details and try again.', fieldErrors: { email: ['Enter a valid email address.'] } })
	render(<ForgotPasswordForm />)
	await user.type(screen.getByLabelText('Email'), 'invalid')
	await user.click(screen.getByRole('button', { name: 'Send reset link' }))
	await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus())
	expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email address.')
	expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
	expect(screen.getByLabelText('Email')).toHaveValue('invalid')
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('replaces the form with a neutral confirmation after sending', async () => {
	const user = userEvent.setup()
	actions.forgotPassword.mockResolvedValue({ ok: true })
	render(<ForgotPasswordForm />)
	await user.type(screen.getByLabelText('Email'), 'owner@example.invalid')
	await user.click(screen.getByRole('button', { name: 'Send reset link' }))
	expect(await screen.findByRole('status')).toHaveTextContent('If an Account exists for that address, we sent a link to reset its password. The link expires in one hour.')
	expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
	expect(screen.queryByRole('button', { name: 'Send reset link' })).not.toBeInTheDocument()
	expect(actions.forgotPassword).toHaveBeenCalledExactlyOnceWith({ email: 'owner@example.invalid' })
})
