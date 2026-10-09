import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { AuthForm } from './auth-form'

const actions = vi.hoisted(() => ({ login: vi.fn(), signup: vi.fn() }))
vi.mock('@/features/auth/actions', () => actions)
const testSecret = () => 'x'.repeat(16)
beforeEach(() => { vi.resetAllMocks() })

it('validates and focuses the first invalid input without calling the action', async () => {
	const user = userEvent.setup()
	render(<AuthForm />)
	await user.click(screen.getByRole('button', { name: 'Log in' }))
	await waitFor(() => expect(screen.getByLabelText('Username')).toHaveFocus())
	expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true')
	expect(actions.login).not.toHaveBeenCalled()
})

it('clears password, visibility and errors on mode switch while preserving non-secret fields', async () => {
	const user = userEvent.setup()
	actions.login.mockResolvedValue({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' })
	render(<AuthForm />)
	await user.type(screen.getByLabelText('Username'), 'owner_name')
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
	expect(screen.getByLabelText('Username')).toHaveValue('owner_name')
	await user.type(screen.getByLabelText('Display Name'), 'My Kitchen')
	await user.click(screen.getByRole('button', { name: 'Login' }))
	await user.click(screen.getByRole('button', { name: 'Sign up' }))
	expect(screen.getByLabelText('Display Name')).toHaveValue('My Kitchen')
	expect(screen.getByText('12-128 characters')).toBeInTheDocument()
})

it('links username conflict to its input and announces pending submission', async () => {
	const user = userEvent.setup()
	let finish!: (value: unknown) => void
	actions.signup.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
	render(<AuthForm />)
	await user.click(screen.getByRole('button', { name: 'Sign up' }))
	await user.type(screen.getByLabelText('Display Name'), 'My Kitchen')
	await user.type(screen.getByLabelText('Username'), 'owner_name')
	await user.type(screen.getByLabelText('Password'), testSecret())
	await user.click(within(screen.getByLabelText('Password').closest('form')!).getByRole('button', { name: 'Sign up' }))
	await waitFor(() => expect(screen.getByRole('button', { name: 'Signing up...' })).toBeDisabled())
	// The button carries the only pending label and announces it.
	expect(screen.getAllByText('Signing up...')).toHaveLength(1)
	expect(screen.getByText('Signing up...')).toHaveAttribute('aria-live', 'polite')
	finish({ ok: false, code: 'USERNAME_UNAVAILABLE', message: 'Username is unavailable.', fieldErrors: { username: ['Username is unavailable.'] } })
	await waitFor(() => expect(screen.getByLabelText('Username')).toHaveFocus())
	expect(screen.getByLabelText('Username')).toHaveAccessibleDescription('Username is unavailable.')
})

