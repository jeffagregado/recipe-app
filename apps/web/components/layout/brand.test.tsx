import { render, screen } from '@testing-library/react'
import Link from 'next/link'
import { expect, it } from 'vitest'

import { Brand } from './brand'
import { BrandMark } from './brand-mark'

it.each([
	['brand link', () => <Brand />],
	['brand mark', () => <Link href="/"><BrandMark /></Link>],
])('names the %s Recapp and draws the lockup as one hidden SVG', (_, ui) => {
	const { container } = render(ui())
	expect(screen.getByRole('link', { name: 'Recapp' })).toBeInTheDocument()
	const drawings = container.querySelectorAll('svg')
	expect(drawings).toHaveLength(1)
	expect(drawings[0]).toHaveAttribute('aria-hidden', 'true')
	expect(drawings[0]).toHaveTextContent('RecApp')
})

it('links the brand home to Recipes', () => {
	render(<Brand />)
	expect(screen.getByRole('link', { name: 'Recapp' })).toHaveAttribute('href', '/recipes')
})
