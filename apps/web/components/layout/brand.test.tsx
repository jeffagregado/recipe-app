import { render, screen } from '@testing-library/react'
import Link from 'next/link'
import { expect, it } from 'vitest'

import { Brand } from './brand'
import { BrandMark } from './brand-mark'

it('names the brand link Recapp and hides the mark from screen readers', () => {
	const { container } = render(<Brand />)
	expect(screen.getByRole('link', { name: 'Recapp Private · Just for you' })).toHaveAttribute('href', '/recipes')
	expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

it('names the brand mark Recapp and hides the mark from screen readers', () => {
	const { container } = render(<Link href="/"><BrandMark /></Link>)
	expect(screen.getByRole('link', { name: 'Recapp' })).toBeInTheDocument()
	expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})
