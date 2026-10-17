import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { LogoutButton } from '@/features/auth/logout-button'
import { DemoModeProvider } from './demo-mode-context'

const action = vi.hoisted(() => ({ logout: vi.fn() }))
vi.mock('@/features/auth/actions', () => action)

afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })

it('says End demo on the demo site, because a Demo account cannot be signed in to again, and still signs out to the start page', async () => {
	const replace = vi.fn()
	vi.stubGlobal('location', { replace })
	action.logout.mockResolvedValue({ ok: true })
	render(<DemoModeProvider enabled><LogoutButton /></DemoModeProvider>)
	expect(screen.queryByRole('button', { name: 'Log out' })).not.toBeInTheDocument()
	await userEvent.click(screen.getByRole('button', { name: 'End demo' }))
	await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith('/auth/login'))
	expect(action.logout).toHaveBeenCalledOnce()
})
