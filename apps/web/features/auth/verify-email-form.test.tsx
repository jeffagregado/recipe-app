import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { VerifyEmailForm } from './verify-email-form'

vi.mock('./verify-email', () => ({ verifyEmail: vi.fn() }))

const onVerify = vi.fn<(input: { token: string }) => Promise<never>>()
const TOKEN = 't'.repeat(43)
const verify = () => screen.getByRole('button', { name: /^Verify my email$|^Verifying/ })

beforeEach(() => { vi.resetAllMocks() })

it('opens with one button and verifies nothing by itself', () => {
	render(<VerifyEmailForm token={TOKEN} onVerify={onVerify} />)
	expect(verify()).toBeEnabled()
	expect(screen.queryByRole('alert')).not.toBeInTheDocument()
	// A mail scanner that opens the link renders this page and stops here.
	expect(onVerify).not.toHaveBeenCalled()
})

it('posts the token once from the keyboard and holds the button while it is in flight', async () => {
	let fail: (error: Error) => void = () => {}
	onVerify.mockReturnValue(new Promise((_resolve, reject) => { fail = reject }))
	const user = userEvent.setup()
	render(<VerifyEmailForm token={TOKEN} onVerify={onVerify} />)
	verify().focus()
	await user.keyboard('{Enter}')
	await waitFor(() => expect(verify()).toHaveTextContent('Verifying…'))
	expect(verify()).toBeDisabled()
	await user.keyboard('{Enter}')
	expect(onVerify).toHaveBeenCalledExactlyOnceWith({ token: TOKEN })
	fail(new Error('network'))
	// Nothing was verified, so the same link can be tried again.
	expect(await screen.findByRole('alert')).toHaveTextContent('We could not verify your email. Please try again.')
	// The message is set after the action's await, so it can render one commit before the transition ends.
	await waitFor(() => expect(verify()).toBeEnabled())
})

it('sends a link without a token for the action to refuse', async () => {
	const user = userEvent.setup()
	render(<VerifyEmailForm onVerify={onVerify} />)
	await user.click(verify())
	expect(onVerify).toHaveBeenCalledExactlyOnceWith({ token: '' })
})
