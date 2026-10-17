import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DemoStartFailure } from './results'
import { StartDemoButton } from './start-demo-button'

// Testing Library's async helpers wait on real timers, so these tests advance fake time by hand.
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const BUSY: DemoStartFailure = { ok: false, code: 'DEMO_BUSY', message: 'The demo is busy right now. Please try again in a few minutes.' }

function deferred() {
	let resolve!: (value: DemoStartFailure) => void
	const promise = new Promise<DemoStartFailure>((done) => { resolve = done })
	return { promise, resolve }
}

const status = () => screen.getByRole('status')

it('says the server is waking up once a start has taken three seconds, until it answers', async () => {
	const reply = deferred()
	render(<StartDemoButton onStart={() => reply.promise} />)
	fireEvent.click(screen.getByRole('button', { name: 'Start demo' }))
	expect(screen.getByRole('button', { name: 'Starting demo…' })).toBeDisabled()

	act(() => { vi.advanceTimersByTime(2_999) })
	expect(status()).toHaveTextContent('')
	act(() => { vi.advanceTimersByTime(1) })
	expect(status()).toHaveTextContent('Waking up the server…')

	await act(async () => { reply.resolve(BUSY) })
	expect(status()).toHaveTextContent('')
	expect(screen.getByRole('alert')).toHaveTextContent(BUSY.message)
	expect(screen.getByRole('button', { name: 'Start demo' })).toBeEnabled()
})

it('shows a quick refusal inline without the waking-up message, and clears it on the next try', async () => {
	const onStart = vi.fn<() => Promise<DemoStartFailure>>().mockResolvedValue(BUSY)
	render(<StartDemoButton onStart={onStart} />)
	await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start demo' })) })
	expect(screen.getByRole('alert')).toHaveTextContent(BUSY.message)
	act(() => { vi.advanceTimersByTime(5_000) })
	expect(status()).toHaveTextContent('')

	onStart.mockReturnValue(new Promise(() => {}))
	fireEvent.click(screen.getByRole('button', { name: 'Start demo' }))
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('says the demo could not start when the request itself fails', async () => {
	render(<StartDemoButton onStart={() => Promise.reject(new Error('network down'))} />)
	await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start demo' })) })
	expect(screen.getByRole('alert')).toHaveTextContent('The demo could not start. Please try again.')
})
