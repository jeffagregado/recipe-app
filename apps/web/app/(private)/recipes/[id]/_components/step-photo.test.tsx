import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ImgHTMLAttributes } from 'react'
import { expect, it, vi } from 'vitest'

vi.mock('next/image', () => ({
	default: ({ src, alt }: ImgHTMLAttributes<HTMLImageElement>) => (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={src} alt={alt} />
	),
}))

import { StepPhoto } from './step-photo'

const SRC = 'https://storage.example/step1.jpg'

async function openPhoto(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole('button', { name: 'Open step 1 photo' }))
	return screen.findByRole('dialog', { name: 'Step 1 photo' })
}

it('shows the step photo as a button that names the step', () => {
	render(<StepPhoto src={SRC} stepNumber={1} />)
	expect(screen.getByRole('button', { name: 'Open step 1 photo' })).toBeInTheDocument()
	expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('opens the same photo large in a titled dialog', async () => {
	const user = userEvent.setup()
	render(<StepPhoto src={SRC} stepNumber={1} />)
	const dialog = await openPhoto(user)
	expect(dialog.querySelector('img')).toHaveAttribute('src', SRC)
	expect(dialog).toHaveTextContent('Step 1 photo')
})

it('closes with the labelled Close button and returns focus to the photo button', async () => {
	const user = userEvent.setup()
	render(<StepPhoto src={SRC} stepNumber={1} />)
	await openPhoto(user)
	await user.click(screen.getByRole('button', { name: 'Close' }))
	await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
	expect(screen.getByRole('button', { name: 'Open step 1 photo' })).toHaveFocus()
})

it('closes with Escape and returns focus to the photo button', async () => {
	const user = userEvent.setup()
	render(<StepPhoto src={SRC} stepNumber={1} />)
	await openPhoto(user)
	await user.keyboard('{Escape}')
	await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
	expect(screen.getByRole('button', { name: 'Open step 1 photo' })).toHaveFocus()
})

it('opens from the keyboard and keeps Tab focus inside the dialog', async () => {
	const user = userEvent.setup()
	render(<StepPhoto src={SRC} stepNumber={1} />)
	screen.getByRole('button', { name: 'Open step 1 photo' }).focus()
	await user.keyboard('{Enter}')
	const dialog = await screen.findByRole('dialog', { name: 'Step 1 photo' })
	const close = within(dialog).getByRole('button', { name: 'Close' })
	// Base UI moves focus on the next animation frame: into the dialog when it opens, and back from the guard a Tab lands on.
	// A Tab pressed before that frame starts from the guard, and user-event then moves on to the document body and the page behind.
	await waitFor(() => expect(close).toHaveFocus())
	for (let press = 0; press < 3; press++) {
		await user.tab()
		await waitFor(() => expect(close).toHaveFocus())
	}
	expect(screen.getByRole('button', { name: 'Open step 1 photo', hidden: true })).not.toHaveFocus()
})

it('closes when the backdrop is clicked', async () => {
	const user = userEvent.setup()
	render(<StepPhoto src={SRC} stepNumber={1} />)
	await openPhoto(user)
	const backdrop = document.querySelector('[data-slot="dialog-overlay"]')
	expect(backdrop).not.toBeNull()
	await user.click(backdrop as HTMLElement)
	await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})
