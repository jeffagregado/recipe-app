import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

const action = vi.hoisted(() => ({ logout: vi.fn() }))
vi.mock('./actions', () => action)

import { LogoutButton } from './logout-button'
import { AUTH_CHANNEL, registerPrivateQueries } from './session-client'

afterEach(() => { action.logout.mockReset(); vi.unstubAllGlobals() })

it('treats a logout with no session as logged out: clears queries, broadcasts token-free and goes home', async () => {
	const replace = vi.fn()
	const postMessage = vi.fn()
	const close = vi.fn()
	vi.stubGlobal('location', { replace })
	vi.stubGlobal('BroadcastChannel', class { constructor(readonly name: string) { expect(name).toBe(AUTH_CHANNEL) } postMessage = postMessage; close = close })
	const client = new QueryClient()
	client.setQueryData(['private'], { secret: true })
	registerPrivateQueries(client)
	action.logout.mockResolvedValue({ ok: true })
	render(<LogoutButton />)
	await userEvent.click(screen.getByRole('button', { name: 'Log out' }))
	await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
	expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'logout' })
	expect(client.getQueryData(['private'])).toBeUndefined()
	expect(screen.queryByRole('alert')).toBeNull()
})
