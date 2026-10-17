import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { AuthServiceError } from '@/features/auth/errors'
import { ContinueDemo } from './demo-start-page'

const queries = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('@/features/auth/queries', () => queries)
beforeEach(() => { vi.resetAllMocks() })

it('offers a signed-in visitor their own demo back', async () => {
	queries.getSession.mockResolvedValue({ status: 'authenticated' })
	render(await ContinueDemo())
	expect(screen.getByRole('link', { name: 'Continue your demo' })).toHaveAttribute('href', '/recipes')
})

it.each([
	['an anonymous visitor', () => queries.getSession.mockResolvedValue({ status: 'anonymous' })],
	['a session read that failed', () => queries.getSession.mockRejectedValue(new AuthServiceError('Session service failed with HTTP 503.'))],
])('offers nothing beside Start demo to %s', async (_visitor, arrange) => {
	arrange()
	const { container } = render(await ContinueDemo())
	expect(container).toBeEmptyDOMElement()
})
