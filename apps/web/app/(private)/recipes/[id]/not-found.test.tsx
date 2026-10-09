import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import NotFound from './not-found'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }))

it('explains the missing page and offers Go now to recipes', () => {
	render(<NotFound />)
	expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'Go now' })).toHaveAttribute('href', '/recipes')
})
