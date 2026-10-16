import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { LandingSession } from './landing-session'

const queries = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/features/auth/queries', () => queries)
beforeEach(() => { vi.resetAllMocks() })

it('offers login and signup links to anonymous visitors in the header', async () => {
	queries.getSession.mockResolvedValue({ status: 'anonymous' })
	render(await LandingSession())
	expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/auth/login')
	expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/auth/login')
	expect(screen.queryByRole('link', { name: 'Open recipes' })).not.toBeInTheDocument()
})

it.each(['hero', 'band'] as const)('repeats only the primary call in the %s', async (placement) => {
	queries.getSession.mockResolvedValue({ status: 'anonymous' })
	render(await LandingSession({ placement }))
	expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/auth/login')
	expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
})

it.each(['header', 'hero', 'band'] as const)('offers recipes instead of sign-in links to authenticated visitors in the %s', async (placement) => {
	queries.getSession.mockResolvedValue({ status: 'authenticated' })
	render(await LandingSession({ placement }))
	expect(screen.getByRole('link', { name: 'Open recipes' })).toHaveAttribute('href', '/recipes')
	expect(screen.queryByRole('link', { name: 'Log in' })).not.toBeInTheDocument()
	expect(screen.queryByRole('link', { name: 'Get started' })).not.toBeInTheDocument()
})
