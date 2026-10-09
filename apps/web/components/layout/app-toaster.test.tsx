import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useAppToast } from '@/lib/use-app-toast'
import { AppToaster } from './app-toaster'

function Triggers() {
	const toast = useAppToast()
	return (
		<>
			<button type="button" onClick={() => toast.success('Recipe saved')}>Show success</button>
			<button type="button" onClick={() => toast.error('Couldn’t save recipe. Try again.')}>Show error</button>
		</>
	)
}

// Testing Library's async helpers wait on real timers, so these tests use fireEvent and advance fake time by hand.
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

beforeEach(() => {
	vi.useFakeTimers()
	render(<AppToaster><Triggers /></AppToaster>)
})
afterEach(() => { vi.useRealTimers() })

it('announces a success toast politely as a status and dismisses it after five seconds', () => {
	fireEvent.click(screen.getByRole('button', { name: 'Show success' }))

	expect(screen.getByRole('status')).toHaveTextContent('Recipe saved')
	expect(screen.getByRole('region', { name: 'Notifications' })).toHaveAttribute('aria-live', 'polite')
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()

	wait(4_900)
	expect(screen.getByRole('status')).toBeInTheDocument()
	wait(200)
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('announces an error toast as an alert and keeps it until it is dismissed', () => {
	fireEvent.click(screen.getByRole('button', { name: 'Show error' }))

	expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save recipe. Try again.')
	expect(screen.queryByRole('status')).not.toBeInTheDocument()

	wait(60_000)
	expect(screen.getByRole('alert')).toBeInTheDocument()

	// Base UI hides an urgent toast's own markup from assistive tech until it receives focus; the alert above is its announcement.
	fireEvent.click(screen.getByRole('button', { name: 'Dismiss', hidden: true }))
	wait(500)
	expect(screen.queryByRole('alert', { hidden: true })).not.toBeInTheDocument()
})

it('exposes a labelled Dismiss button that closes a success toast early', () => {
	fireEvent.click(screen.getByRole('button', { name: 'Show success' }))

	const dismiss = screen.getByRole('button', { name: 'Dismiss' })
	expect(dismiss.tagName).toBe('BUTTON')
	fireEvent.click(dismiss)
	wait(500)
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
