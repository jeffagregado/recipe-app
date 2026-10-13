import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChangeEmailInput } from '@recipe-app/contracts/types'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import type { ChangeEmailResult, PendingEmailChangeResult } from '../actions/results'
import { EmailCard } from './email-card'

vi.mock('../actions/change-email', () => ({ changeEmail: vi.fn() }))
vi.mock('../actions/pending-email-change', () => ({ resendEmailChange: vi.fn(), cancelEmailChange: vi.fn() }))

const onChange = vi.fn<(input: ChangeEmailInput) => Promise<ChangeEmailResult>>()
const onResend = vi.fn<() => Promise<PendingEmailChangeResult>>()
const onCancel = vi.fn<() => Promise<PendingEmailChangeResult>>()
const EMAIL = 'ana@example.com'
const NEW = 'ana.new@example.com'
const PASSWORD = ' old password '

beforeEach(() => {
	vi.resetAllMocks()
	onChange.mockResolvedValue({ status: 'sent' })
	onResend.mockResolvedValue({ status: 'resent' })
	onCancel.mockResolvedValue({ status: 'cancelled' })
})

type State = { pendingEmail?: string | null; hasPassword?: boolean }
const element = ({ pendingEmail = null, hasPassword = true }: State = {}) => (
	<AppToaster>
		<EmailCard email={EMAIL} pendingEmail={pendingEmail} hasPassword={hasPassword} onChange={onChange} onResend={onResend} onCancel={onCancel} />
	</AppToaster>
)
function renderCard(state?: State) {
	render(element(state))
	return userEvent.setup()
}
const card = () => screen.getByRole('region', { name: 'Email' })
const currentEmail = () => within(card()).getByLabelText('Current email')
const newEmail = () => within(card()).getByLabelText('New email')
const password = () => within(card()).getByLabelText('Current password')
const send = () => within(card()).getByRole('button', { name: /^Send verification link$|^Sending/ })
const banner = () => within(card()).getByRole('group', { name: 'Pending email change' })
const resend = () => within(banner()).getByRole('button', { name: /^Resend$|^Sending/ })
const cancel = () => within(banner()).getByRole('button', { name: /^Cancel$|^Cancelling/ })
async function fill(user: ReturnType<typeof userEvent.setup>, email = NEW, currentPassword = PASSWORD) {
	await user.type(newEmail(), email)
	await user.type(password(), currentPassword)
}

it('shows the current email read-only with its Verified mark, and an Account with a password the change form with nothing to send yet', () => {
	renderCard()
	expect(within(card()).getByRole('heading', { level: 2, name: 'Email' })).toBeInTheDocument()
	expect(within(card()).getByText('Sign-in and recovery address.')).toBeInTheDocument()
	expect(currentEmail()).toHaveValue(EMAIL)
	expect(currentEmail()).toHaveAttribute('readonly')
	expect(currentEmail()).toHaveAccessibleDescription('Verified')
	expect(newEmail()).toHaveAttribute('type', 'email')
	expect(newEmail()).toHaveAttribute('autocomplete', 'email')
	expect(password()).toHaveAttribute('type', 'password')
	expect(password()).toHaveAttribute('autocomplete', 'current-password')
	expect(send()).toBeDisabled()
	expect(within(card()).queryByRole('group')).not.toBeInTheDocument()
	expect(within(card()).queryByText('Set a password before changing your email.')).not.toBeInTheDocument()
})

it('shows an Account without a password its email, the reason and no form', () => {
	renderCard({ hasPassword: false })
	expect(currentEmail()).toHaveValue(EMAIL)
	expect(currentEmail()).toHaveAccessibleDescription('Verified')
	expect(within(card()).getByText('Set a password before changing your email.')).toBeInTheDocument()
	expect(within(card()).queryByLabelText('New email')).not.toBeInTheDocument()
	expect(within(card()).queryByLabelText('Current password')).not.toBeInTheDocument()
	expect(within(card()).queryByRole('button')).not.toBeInTheDocument()
})

it('unlocks the form once the Account has a password', () => {
	const view = render(element({ hasPassword: false }))
	view.rerender(element({ hasPassword: true }))
	expect(newEmail()).toBeInTheDocument()
	expect(within(card()).queryByText('Set a password before changing your email.')).not.toBeInTheDocument()
})

it('names the pending address in a banner with Resend and Cancel, above a form that can start a different change', () => {
	renderCard({ pendingEmail: NEW })
	// Only the sentence is announced; the two buttons sit beside it in the same group.
	const announced = within(banner()).getByRole('status')
	expect(announced.textContent).toBe('We sent a link to ana.new@example.com. Your email changes once you open it.')
	expect(within(announced).queryByRole('button')).not.toBeInTheDocument()
	expect(resend()).toBeEnabled()
	expect(cancel()).toBeEnabled()
	// The Account's email has not changed.
	expect(currentEmail()).toHaveValue(EMAIL)
	expect(newEmail()).toHaveValue('')
})

it('enables Send verification link only when both fields hold something', async () => {
	const user = renderCard()
	await user.type(newEmail(), NEW)
	expect(send()).toBeDisabled()
	await user.type(password(), 'x')
	expect(send()).toBeEnabled()
	await user.clear(newEmail())
	expect(send()).toBeDisabled()
})

// The email rule belongs to the contract's tests; one rejected value shows where its message goes.
it('puts the error for a rejected new email on that field, focuses it and does not send', async () => {
	const user = renderCard()
	await fill(user, 'ana.new')
	await user.click(send())
	await waitFor(() => expect(newEmail()).toHaveAccessibleDescription('Enter a valid email address.'))
	expect(newEmail()).toHaveAttribute('aria-invalid', 'true')
	expect(newEmail()).toHaveFocus()
	expect(password()).toHaveAttribute('aria-invalid', 'false')
	expect(onChange).not.toHaveBeenCalled()
})

it('sends once with the normalized email and the untrimmed password, announces it in a toast and clears both fields', async () => {
	const user = renderCard()
	await fill(user, ' Ana.New@Example.com ')
	await user.keyboard('{Enter}')
	await waitFor(() => expect(onChange).toHaveBeenCalledExactlyOnceWith({ newEmail: NEW, currentPassword: PASSWORD }))
	expect(await screen.findByText('Verification link sent')).toBeInTheDocument()
	await waitFor(() => expect(newEmail()).toHaveValue(''))
	expect(password()).toHaveValue('')
	expect(send()).toBeDisabled()
	expect(newEmail()).toHaveAttribute('aria-invalid', 'false')
	expect(password()).toHaveAttribute('aria-invalid', 'false')
})

it.each([
	['newEmail', 'Email already exists.', newEmail, password],
	['currentPassword', 'Current password is incorrect.', password, newEmail],
] as const)('shows a refusal about %s on that field only, focuses it and keeps what was typed', async (field, message, refused, other) => {
	onChange.mockResolvedValue({ status: 'invalid', field, message })
	const user = renderCard()
	await fill(user)
	await user.click(send())
	await waitFor(() => expect(refused()).toHaveAccessibleDescription(message))
	await waitFor(() => expect(refused()).toHaveFocus())
	expect(refused()).toHaveAttribute('aria-invalid', 'true')
	expect(other()).toHaveAttribute('aria-invalid', 'false')
	expect(newEmail()).toHaveValue(NEW)
	expect(password()).toHaveValue(PASSWORD)
	expect(send()).toBeEnabled()
	// The toast is rendered and announced, so its text appears more than once.
	expect((await screen.findAllByText('Couldn’t send the verification link. Try again.')).length).toBeGreaterThan(0)
	expect(screen.queryByText('Verification link sent')).not.toBeInTheDocument()
	// Correcting the field clears its error. A letter keeps the address a valid one.
	await user.type(refused(), 'x')
	await waitFor(() => expect(refused()).toHaveAttribute('aria-invalid', 'false'))
})

it.each([
	['session-expired', 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
	['failed', 'Too many attempts. Try again later.'],
] as const)('explains a %s request inside the card, keeps both fields and lets the person retry', async (status, message) => {
	onChange.mockResolvedValue({ status, message })
	const user = renderCard()
	await fill(user)
	await user.click(send())
	expect(await within(card()).findByRole('alert')).toHaveTextContent(message)
	expect(newEmail()).toHaveValue(NEW)
	expect(password()).toHaveValue(PASSWORD)
	expect(send()).toBeEnabled()
	// Editing again clears the stale explanation.
	await user.type(newEmail(), '!')
	expect(within(card()).queryByRole('alert')).not.toBeInTheDocument()
})

it('holds the form while a request is in flight and reports one that threw as a failure', async () => {
	let fail: (reason: Error) => void = () => {}
	onChange.mockReturnValue(new Promise((_resolve, reject) => { fail = reject }))
	const user = renderCard()
	await fill(user)
	await user.click(send())
	await waitFor(() => expect(send()).toHaveTextContent('Sending…'))
	expect(send()).toBeDisabled()
	expect(newEmail()).toHaveAttribute('readonly')
	expect(password()).toHaveAttribute('readonly')
	await user.type(password(), '{Enter}')
	fail(new Error('network'))
	expect(await within(card()).findByRole('alert')).toHaveTextContent('Couldn’t send the verification link. Try again.')
	expect(onChange).toHaveBeenCalledOnce()
})

it.each([
	['Resend', resend, onResend, 'resent', 'Verification link sent again', 'Sending…'],
	['Cancel', cancel, onCancel, 'cancelled', 'Email change cancelled', 'Cancelling…'],
] as const)('%s acts once from the keyboard, holds both banner buttons meanwhile and announces the outcome in a toast', async (_name, button, action, status, message, busy) => {
	let finish: (result: PendingEmailChangeResult) => void = () => {}
	action.mockReturnValue(new Promise((resolve) => { finish = resolve }))
	const user = renderCard({ pendingEmail: NEW })
	button().focus()
	await user.keyboard('{Enter}')
	await waitFor(() => expect(button()).toHaveTextContent(busy))
	expect(resend()).toBeDisabled()
	expect(cancel()).toBeDisabled()
	finish({ status })
	expect(await screen.findByText(message)).toBeInTheDocument()
	expect(action).toHaveBeenCalledOnce()
	await waitFor(() => expect(resend()).toBeEnabled())
	expect(cancel()).toBeEnabled()
	expect(within(card()).queryByRole('alert')).not.toBeInTheDocument()
	expect(onChange).not.toHaveBeenCalled()
})

it.each([
	['Resend', resend, onResend, { status: 'failed', message: 'You asked for too many emails. Try again in an hour.' }, 'You asked for too many emails. Try again in an hour.'],
	['Cancel', cancel, onCancel, { status: 'session-expired', message: 'Your session has expired. Sign in again in another tab, then come back here and try again.' }, 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
] as const)('explains a %s that did not happen inside the card and keeps the banner', async (_name, button, action, result, message) => {
	action.mockResolvedValue(result)
	const user = renderCard({ pendingEmail: NEW })
	await user.click(button())
	expect(await within(card()).findByRole('alert')).toHaveTextContent(message)
	expect(banner()).toHaveTextContent(NEW)
	expect(button()).toBeEnabled()
})

it('reports a banner action that threw as a failure', async () => {
	onCancel.mockRejectedValue(new Error('network'))
	const user = renderCard({ pendingEmail: NEW })
	await user.click(cancel())
	expect(await within(card()).findByRole('alert')).toHaveTextContent('Couldn’t cancel the change. Try again.')
})
