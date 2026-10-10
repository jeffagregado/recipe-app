import { fireEvent, render, screen } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { expect, it, vi } from 'vitest'

// The mock keeps the load/error events and exposes `unoptimized`, which is how the direct-URL fallback is requested.
vi.mock('next/image', () => ({
	default: ({ src, alt, onLoad, onError, unoptimized }: ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={src as string} alt={alt} onLoad={onLoad} onError={onError} data-unoptimized={String(Boolean(unoptimized))} />
	),
}))

import { RecipePhoto } from './recipe-photo'

const SRC = 'https://storage.example/cover.jpg'
const skeleton = () => document.querySelector('[data-slot="skeleton"]')

it('shows a loading skeleton until the photo has loaded', () => {
	render(<RecipePhoto src={SRC} alt="Pasta" fill sizes="100vw" />)
	expect(skeleton()).toBeInTheDocument()
	expect(screen.getByRole('img', { name: 'Pasta' })).toHaveAttribute('data-unoptimized', 'false')
	fireEvent.load(screen.getByRole('img', { name: 'Pasta' }))
	expect(skeleton()).not.toBeInTheDocument()
})

it('retries the optimizer once, then loads the photo directly, keeping the skeleton meanwhile', () => {
	render(<RecipePhoto src={SRC} alt="Pasta" fill sizes="100vw" />)
	const first = screen.getByRole('img', { name: 'Pasta' })
	fireEvent.error(first)
	const second = screen.getByRole('img', { name: 'Pasta' })
	expect(second).not.toBe(first)
	expect(second).toHaveAttribute('data-unoptimized', 'false')
	fireEvent.error(second)
	const direct = screen.getByRole('img', { name: 'Pasta' })
	expect(direct).toHaveAttribute('data-unoptimized', 'true')
	expect(direct).toHaveAttribute('src', SRC)
	expect(skeleton()).toBeInTheDocument()
	fireEvent.load(direct)
	expect(skeleton()).not.toBeInTheDocument()
})

it('shows a placeholder, not a broken image, when every attempt fails', () => {
	render(<RecipePhoto src={SRC} alt="Pasta" fill sizes="100vw" />)
	for (let attempt = 0; attempt < 3; attempt++) fireEvent.error(screen.getByRole('img', { name: 'Pasta' }))
	expect(screen.getByRole('img', { name: 'Pasta (photo unavailable)' })).toBeInTheDocument()
	expect(document.querySelector('img')).not.toBeInTheDocument()
	expect(skeleton()).not.toBeInTheDocument()
})

it('uses the unavailable label it is given', () => {
	render(<RecipePhoto src={SRC} alt="Current cover photo" fill sizes="100vw" unavailableLabel="Current cover photo (preview unavailable)" />)
	for (let attempt = 0; attempt < 3; attempt++) fireEvent.error(screen.getByRole('img', { name: 'Current cover photo' }))
	expect(screen.getByRole('img', { name: 'Current cover photo (preview unavailable)' })).toBeInTheDocument()
})
