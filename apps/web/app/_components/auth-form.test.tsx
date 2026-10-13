import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { redirect } from 'next/navigation'
import { Component, type ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AuthForm } from './auth-form'

const actions = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn(), resendVerification: vi.fn() }))
vi.mock('@/features/auth/actions', () => actions)
const testSecret = () => 'x'.repeat(16)
beforeEach(() => { vi.resetAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

it('offers the forgot-password link in Login mode only', async () => {
	const user = userEvent.setup()
	render(<AuthForm />)
	expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password')
	await user.click(screen.getByRole('button', { name: 'Sign up' }))
	expect(screen.queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument()
})

/** Stands in for the Next router, which receives the redirect a successful action throws. */
class Redirected extends Component<{ children: ReactNode }, { done: boolean }> {
	state = { done: false }
	static getDerivedStateFromError() { return { done: true } }
	render() { return this.state.done ? <p>Redirected</p> : this.props.children }
}

it('validates and focuses the first invalid input without calling the action', async () => {
	const user = userEvent.setup()
	render(<AuthForm />)
	await user.click(screen.getByRole('button', { name: 'Log in' }))
	await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus())
	expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
	expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter your email.')
	expect(actions.login).not.toHaveBeenCalled()
})

it.each(['Login', 'Sign up'])('shows a malformed email inline and focuses it in %s mode', async (mode) => {
	const user = userEvent.setup()
	render(<AuthForm />)
	await user.click(screen.getByRole('button', { name: mode }))
	if (mode === 'Sign up') await user.type(screen.getByLabelText('Display Name'), 'My Kitchen')
	await user.type(screen.getByLabelText('Email'), 'owner.example.invalid')
	await user.type(screen.getByLabelText('Password'), testSecret())
	await user.keyboard('{Enter}')
	await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus())
	expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Enter a valid email address.')
	expect(actions.login).not.toHaveBeenCalled()
	expect(actions.signup).not.toHaveBeenCalled()
})

it('offers the email keyboard and autofill, and submits the email with the password', async () => {
	const user = userEvent.setup()
	actions.login.mockResolvedValue({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })
	render(<AuthForm />)
	const email = screen.getByLabelText('Email')
	expect(email).toHaveAttribute('type', 'email')
	expect(email).toHaveAttribute('autocomplete', 'email')
	expect(screen.queryByLabelText('Username')).not.toBeInTheDocument()
	await user.type(email, 'owner@example.invalid')
	await user.type(screen.getByLabelText('Password'), testSecret())
	await user.click(screen.getByRole('button', { name: 'Log in' }))
	expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
	expect(actions.login).toHaveBeenCalledExactlyOnceWith({ email: 'owner@example.invalid', password: testSecret() })
	expect(screen.queryByRole('button', { name: 'Resend verification email' })).not.toBeInTheDocument()
})

it('tells an unverified login to verify and resends to the submitted email, until the next attempt', async () => {
	const user = userEvent.setup()
	actions.login.mockResolvedValueOnce({ ok: false, code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before logging in.' })
	actions.resendVerification.mockResolvedValue({ ok: true })
	render(<AuthForm />)
	await user.type(screen.getByLabelText('Email'), ' Owner@Example.invalid')
	await user.type(screen.getByLabelText('Password'), testSecret())
	await user.click(screen.getByRole('button', { name: 'Log in' }))
	expect(await screen.findByRole('alert')).toHaveTextContent('Verify your email before logging in.')
	await user.click(screen.getByRole('button', { name: 'Resend verification email' }))
	expect(await screen.findByRole('status')).toHaveTextContent('If that address needs verifying, we sent a new link.')
	expect(actions.resendVerification).toHaveBeenCalledExactlyOnceWith({ email: 'owner@example.invalid' })
	expect(actions.login).toHaveBeenCalledOnce()
	actions.login.mockResolvedValueOnce({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })
	await user.click(screen.getByRole('button', { name: 'Log in' }))
	expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
	expect(screen.queryByRole('button', { name: 'Resend verification email' })).not.toBeInTheDocument()
})

// Signup creates no session, so only a login may tell other tabs that one started.
it.each([
	['Login', 'Log in', [{ type: 'login' }]],
	['Sign up', 'Sign up', []],
])('announces a new session to other tabs after %s only when one was created', async (mode, submit, expected) => {
	const user = userEvent.setup()
	const posted: unknown[] = []
	vi.stubGlobal('BroadcastChannel', class { postMessage = (message: unknown) => { posted.push(message) }; close = () => {} })
	let redirectError: unknown
	try { redirect('/') } catch (error) { redirectError = error }
	actions.login.mockRejectedValue(redirectError)
	actions.signup.mockRejectedValue(redirectError)
	vi.spyOn(console, 'error').mockImplementation(() => {})
	render(<Redirected><AuthForm /></Redirected>)
	await user.click(screen.getByRole('button', { name: mode }))
	if (mode === 'Sign up') await user.type(screen.getByLabelText('Display Name'), 'My Kitchen')
	await user.type(screen.getByLabelText('Email'), 'owner@example.invalid')
	await user.type(screen.getByLabelText('Password'), testSecret())
	await user.click(within(screen.getByLabelText('Password').closest('form')!).getByRole('button', { name: submit }))
	await screen.findByText('Redirected')
	expect(posted).toEqual(expected)
})

it('clears password, visibility and errors on mode switch while preserving non-secret fields', async () => {
	const user = userEvent.setup()
	actions.login.mockResolvedValue({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })
	render(<AuthForm />)
	await user.type(screen.getByLabelText('Email'), 'owner@example.invalid')
	await user.type(screen.getByLabelText('Password'), testSecret())
	await user.click(screen.getByRole('button', { name: 'Show password' }))
	expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
	await user.click(screen.getByRole('button', { name: 'Log in' }))
	await screen.findByRole('alert')
	await user.click(screen.getByRole('button', { name: 'Sign up' }))
	expect(screen.getByLabelText('Password')).toHaveValue('')
	expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
	expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password')
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	expect(screen.getByLabelText('Email')).toHaveValue('owner@example.invalid')
	await user.type(screen.getByLabelText('Display Name'), 'My Kitchen')
	await user.click(screen.getByRole('button', { name: 'Login' }))
	await user.click(screen.getByRole('button', { name: 'Sign up' }))
	expect(screen.getByLabelText('Display Name')).toHaveValue('My Kitchen')
	expect(screen.getByText('12-128 characters')).toBeInTheDocument()
})

it('links the email conflict to its input and announces pending submission', async () => {
	const user = userEvent.setup()
	let finish!: (value: unknown) => void
	actions.signup.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
	render(<AuthForm />)
	await user.click(screen.getByRole('button', { name: 'Sign up' }))
	await user.type(screen.getByLabelText('Display Name'), 'My Kitchen')
	await user.type(screen.getByLabelText('Email'), 'owner@example.invalid')
	await user.type(screen.getByLabelText('Password'), testSecret())
	await user.click(within(screen.getByLabelText('Password').closest('form')!).getByRole('button', { name: 'Sign up' }))
	await waitFor(() => expect(screen.getByRole('button', { name: 'Signing up...' })).toBeDisabled())
	// The button carries the only pending label and announces it.
	expect(screen.getAllByText('Signing up...')).toHaveLength(1)
	expect(screen.getByText('Signing up...')).toHaveAttribute('aria-live', 'polite')
	finish({ ok: false, code: 'EMAIL_ALREADY_EXISTS', message: 'Email already exists.', fieldErrors: { email: ['Email already exists.'] } })
	await waitFor(() => expect(screen.getByLabelText('Email')).toHaveFocus())
	expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email already exists.')
})

// A native submit before hydration must send the fields in the body, never in the URL.
it.each(['Login', 'Sign up'])('declares the post method in %s mode', async (mode) => {
	const user = userEvent.setup()
	render(<AuthForm />)
	await user.click(screen.getByRole('button', { name: mode }))
	expect(screen.getByLabelText('Password').closest('form')).toHaveAttribute('method', 'post')
})

