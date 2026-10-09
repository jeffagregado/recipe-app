import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import NotFound from './not-found'

it('explains the missing page and links back to recipes', () => {
	render(<NotFound />)
	expect(screen.getByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
	expect(screen.getByRole('link', { name: /recipes/i })).toHaveAttribute('href', '/recipes')
})
