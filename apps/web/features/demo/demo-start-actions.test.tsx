import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { AuthServiceError } from '@/features/auth/errors'
import { DemoStartActions } from './demo-start-actions'

const queries = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/features/auth/queries', () => queries)
const router = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/navigation')>()), useRouter: () => router }))
vi.mock('./actions', () => ({ startDemo: vi.fn() }))
beforeEach(() => { vi.resetAllMocks() })

it('offers Start demo to a visitor without a demo', async () => {
	queries.getSession.mockResolvedValue({ status: 'anonymous' })
	render(await DemoStartActions())
	expect(screen.getByRole('button', { name: 'Start demo' })).toBeEnabled()
	expect(screen.queryByRole('link', { name: 'Continue your demo' })).not.toBeInTheDocument()
})

it('offers a signed-in visitor their own demo back', async () => {
	queries.getSession.mockResolvedValue({ status: 'authenticated' })
	render(await DemoStartActions())
	expect(screen.getByRole('link', { name: 'Continue your demo' })).toHaveAttribute('href', '/recipes')
})

it('offers only Try again when the session check fails, so Start demo cannot replace a demo the visitor still has', async () => {
	queries.getSession.mockRejectedValue(new AuthServiceError('Authentication request /auth/session failed or timed out.'))
	render(await DemoStartActions())
	expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t reach the server')
	expect(screen.queryByRole('button', { name: 'Start demo' })).not.toBeInTheDocument()
	expect(screen.queryByRole('link', { name: 'Continue your demo' })).not.toBeInTheDocument()
	await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
	expect(router.refresh).toHaveBeenCalledOnce()
})
