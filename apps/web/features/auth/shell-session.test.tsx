import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

vi.mock('./queries', () => ({ requireSession: async () => ({ user: { id: 'user-1', displayName: 'Temporary verification', hasPassword: true, google: null } }) }))
vi.mock('./session-freshness', () => ({ SessionFreshness: () => <span data-testid="session-freshness" /> }))

import { ShellSession } from './shell-session'

it('shows only the Log out button on mobile, without the display name', async () => {
	render(await ShellSession({ mobile: true }))
	expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
	expect(screen.queryByText('Temporary verification')).toBeNull()
	expect(screen.queryByTestId('session-freshness')).toBeNull()
})

it('shows the display name, Log out and the session freshness observer on desktop', async () => {
	render(await ShellSession({}))
	expect(screen.getByText('Temporary verification')).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
	expect(screen.getByTestId('session-freshness')).toBeInTheDocument()
})
