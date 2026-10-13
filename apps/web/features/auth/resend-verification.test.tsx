import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { ResendVerification } from './resend-verification'

const actions = vi.hoisted(() => ({ resendVerification: vi.fn() }))
vi.mock('./actions', () => actions)
beforeEach(() => { vi.resetAllMocks() })

const SENT = 'If that address needs verifying, we sent a new link.'
const resend = () => screen.getByRole('button', { name: 'Resend verification email' })

it('resends to the bound address from a single button and confirms inline without naming an Account', async () => {
	const user = userEvent.setup()
	actions.resendVerification.mockResolvedValue({ ok: true })
	render(<ResendVerification email="owner@example.invalid" />)
	expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
	expect(resend()).toHaveAttribute('type', 'button')
	await user.click(resend())
	expect(await screen.findByRole('status')).toHaveTextContent(SENT)
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	expect(actions.resendVerification).toHaveBeenCalledExactlyOnceWith({ email: 'owner@example.invalid' })
})

it('asks for the address when none is bound and resends to the one typed', async () => {
	const user = userEvent.setup()
	actions.resendVerification.mockResolvedValue({ ok: true })
	render(<ResendVerification />)
	const email = screen.getByLabelText('Email')
	expect(email).toHaveAttribute('type', 'email')
	expect(email).toHaveAttribute('autocomplete', 'email')
	await user.type(email, 'owner@example.invalid{Enter}')
	expect(await screen.findByRole('status')).toHaveTextContent(SENT)
	expect(actions.resendVerification).toHaveBeenCalledExactlyOnceWith({ email: 'owner@example.invalid' })
})

it.each([
	['the rate limit', () => Promise.resolve({ ok: false, code: 'RATE_LIMITED', message: 'You asked for too many emails. Please try again later.' }), 'You asked for too many emails. Please try again later.'],
	['a failed action call', () => Promise.reject(new TypeError('Test transport failed')), 'We could not send the email. Please try again.'],
])('reports %s inline as an alert and lets the person try again', async (_cause, respond, message) => {
	const user = userEvent.setup()
	actions.resendVerification.mockImplementation(respond)
	render(<ResendVerification email="owner@example.invalid" />)
	await user.click(resend())
	expect(await screen.findByRole('alert')).toHaveTextContent(message)
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
	expect(resend()).toBeEnabled()
})

it('links a rejected address to its field and focuses it', async () => {
	const user = userEvent.setup()
	actions.resendVerification.mockResolvedValue({ ok: false, code: 'VALIDATION_FAILED', message: 'Check your details and try again.', fieldErrors: { email: ['Enter a valid email address.'] } })
	render(<ResendVerification />)
	await user.type(screen.getByLabelText('Email'), 'not-an-address')
	await user.click(resend())
	await waitFor(() => expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email address.'))
	expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
	expect(screen.getByLabelText('Email')).toHaveFocus()
	expect(screen.getByLabelText('Email')).toHaveValue('not-an-address')
	expect(actions.resendVerification).toHaveBeenCalledExactlyOnceWith({ email: 'not-an-address' })
})

it('disables the button while a resend is pending and clears the earlier result', async () => {
	const user = userEvent.setup()
	let finish!: (value: unknown) => void
	actions.resendVerification.mockResolvedValueOnce({ ok: true }).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
	render(<ResendVerification email="owner@example.invalid" />)
	await user.click(resend())
	await screen.findByRole('status')
	await user.click(resend())
	await waitFor(() => expect(resend()).toBeDisabled())
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
	finish({ ok: true })
	await waitFor(() => expect(resend()).toBeEnabled())
	expect(actions.resendVerification).toHaveBeenCalledTimes(2)
})
