import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { PageNotFound } from './page-not-found'

const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

beforeEach(() => {
	vi.useFakeTimers()
	router.replace.mockReset()
})
afterEach(() => { vi.useRealTimers() })

it('says the page was not found and offers Go now to Recipes', () => {
	render(<PageNotFound />)
	expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
	expect(screen.getByRole('status')).toHaveTextContent('Taking you to Recipes in 5 seconds.')
	expect(screen.getByRole('link', { name: 'Go now' })).toHaveAttribute('href', '/recipes')
})

it('redirects to Recipes after five seconds and not before', () => {
	render(<PageNotFound />)
	wait(4_999)
	expect(router.replace).not.toHaveBeenCalled()
	wait(1)
	expect(router.replace).toHaveBeenCalledExactlyOnceWith('/recipes')
})

it('announces once: the status text never changes while counting down', () => {
	render(<PageNotFound />)
	const status = screen.getByRole('status')
	wait(3_000)
	expect(screen.getByRole('status')).toBe(status)
	expect(status).toHaveTextContent('Taking you to Recipes in 5 seconds.')
})

it('does not redirect after Go now is used', () => {
	render(<PageNotFound />)
	const link = screen.getByRole('link', { name: 'Go now' })
	// Next's Link would navigate; jsdom cannot, so only the click handler is exercised.
	link.addEventListener('click', (event) => event.preventDefault())
	fireEvent.click(link)
	wait(10_000)
	expect(router.replace).not.toHaveBeenCalled()
})

it('clears the timer on unmount so a user who moved on is not redirected', () => {
	const { unmount } = render(<PageNotFound />)
	wait(2_000)
	unmount()
	wait(10_000)
	expect(router.replace).not.toHaveBeenCalled()
})
