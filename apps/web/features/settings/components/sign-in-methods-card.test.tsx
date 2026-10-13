import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { GoogleSignIn } from '@recipe-app/contracts/types'
import { beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import type { ConnectGoogleResult, DisconnectGoogleResult } from '../actions/results'
import { SignInMethodsCard } from './sign-in-methods-card'

vi.mock('../actions/connect-google', () => ({ connectGoogle: vi.fn() }))
vi.mock('../actions/disconnect-google', () => ({ disconnectGoogle: vi.fn() }))

const onConnect = vi.fn<() => Promise<ConnectGoogleResult>>()
const onDisconnect = vi.fn<() => Promise<DisconnectGoogleResult>>()
const ANA: GoogleSignIn = { email: 'ana@gmail.com' }

beforeEach(() => {
	vi.resetAllMocks()
	onDisconnect.mockResolvedValue({ status: 'disconnected' })
})

type Account = { hasPassword?: boolean; google?: GoogleSignIn | null }
const element = ({ hasPassword = true, google = ANA }: Account = {}) => (
	<AppToaster><SignInMethodsCard hasPassword={hasPassword} google={google} onConnect={onConnect} onDisconnect={onDisconnect} /></AppToaster>
)
function renderCard(account?: Account) {
	const view = render(element(account))
	return { user: userEvent.setup(), rerender: (next: Account) => view.rerender(element(next)) }
}
const card = () => screen.getByRole('region', { name: 'Sign-in methods' })
const row = (name: 'Password' | 'Google') => within(card()).getAllByRole('listitem').find((item) => within(item).queryByText(name, { exact: false }))!
const disconnect = () => within(card()).getByRole('button', { name: /^Disconnect Google$|^Disconnecting/ })
const connect = () => within(card()).getByRole('button', { name: /^Connect Google$|^Connecting/ })
const dialog = () => screen.findByRole('alertdialog', { name: 'Disconnect Google?' })

it('names the card and promises that one way in always stays', () => {
	renderCard()
	expect(within(card()).getByRole('heading', { level: 2, name: 'Sign-in methods' })).toBeInTheDocument()
	expect(within(card()).getByText('You always keep at least one way in.')).toBeInTheDocument()
	expect(within(card()).getAllByRole('listitem')).toHaveLength(2)
})

it.each([
	[true, 'Set'],
	[false, 'Not set'],
])('marks the password of an Account whose has-password field is %j as %j', (hasPassword, mark) => {
	renderCard({ hasPassword })
	expect(row('Password')).toHaveTextContent(`Password${mark}`)
})

it('shows a connected Google account by its address with a way to disconnect, and offers no connect', () => {
	renderCard()
	expect(row('Google')).toHaveTextContent('Google · ana@gmail.com')
	expect(disconnect()).toBeEnabled()
	expect(disconnect()).toHaveTextContent('Disconnect')
	expect(within(card()).queryByRole('button', { name: 'Connect Google' })).not.toBeInTheDocument()
	expect(within(card()).queryByText('Set a password first.')).not.toBeInTheDocument()
})

it('shows a Google identity attached before its address was kept as connected, without an address', () => {
	renderCard({ google: { email: null } })
	expect(row('Google')).toHaveTextContent(/^GoogleDisconnect$/)
	expect(disconnect()).toBeEnabled()
})

it('offers to connect Google with its mark when none is attached, and nothing to disconnect', () => {
	renderCard({ google: null })
	expect(row('Google')).toHaveTextContent(/^GoogleConnect$/)
	expect(connect()).toBeEnabled()
	expect(connect().querySelector('svg[aria-hidden="true"]')).not.toBeNull()
	expect(within(card()).queryByRole('button', { name: 'Disconnect Google' })).not.toBeInTheDocument()
})

it('disables Disconnect for an Account without a password and says why beside it, instead of hiding it', async () => {
	const { user } = renderCard({ hasPassword: false })
	expect(disconnect()).toBeDisabled()
	expect(within(card()).getByText('Set a password first.')).toBeInTheDocument()
	expect(disconnect()).toHaveAccessibleDescription('Set a password first.')
	await user.click(disconnect())
	expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
	expect(onDisconnect).not.toHaveBeenCalled()
})

it('asks before disconnecting and removes nothing when the person keeps Google', async () => {
	const { user } = renderCard()
	await user.click(disconnect())
	const confirmation = await dialog()
	expect(within(confirmation).getByText('You’ll sign in with your email and password from now on.')).toBeInTheDocument()
	await user.click(within(confirmation).getByRole('button', { name: 'Keep' }))
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
	expect(onDisconnect).not.toHaveBeenCalled()
})

it('opens, declines and confirms the dialog by keyboard alone, returning focus to the button each time', async () => {
	const { user } = renderCard()
	await user.tab()
	expect(disconnect()).toHaveFocus()
	await user.keyboard('{Enter}')
	const confirmation = await dialog()
	// The safe choice is where the keyboard lands; Escape declines.
	await waitFor(() => expect(within(confirmation).getByRole('button', { name: 'Keep' })).toHaveFocus())
	await user.keyboard('{Escape}')
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
	expect(onDisconnect).not.toHaveBeenCalled()
	await waitFor(() => expect(disconnect()).toHaveFocus())

	await user.keyboard('{Enter}')
	const again = await dialog()
	await waitFor(() => expect(within(again).getByRole('button', { name: 'Keep' })).toHaveFocus())
	await user.tab()
	expect(within(again).getByRole('button', { name: 'Disconnect' })).toHaveFocus()
	await user.keyboard('{Enter}')
	await waitFor(() => expect(onDisconnect).toHaveBeenCalledOnce())
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
})

it('confirms a disconnect with a toast, and keeps focus on the same button when it becomes Connect', async () => {
	const { user, rerender } = renderCard()
	await user.click(disconnect())
	await user.click(within(await dialog()).getByRole('button', { name: 'Disconnect' }))
	// The toast is rendered and announced, so its text appears more than once.
	expect((await screen.findAllByText('Google disconnected')).length).toBeGreaterThan(0)
	expect(onDisconnect).toHaveBeenCalledOnce()
	expect(within(card()).queryByRole('alert')).not.toBeInTheDocument()
	await waitFor(() => expect(disconnect()).toHaveFocus())
	// The action refreshes the page, and the session read no longer reports Google.
	rerender({ google: null })
	expect(connect()).toHaveFocus()
})

it('sends one request for a double confirm and shows the button as busy meanwhile', async () => {
	let finish: (result: DisconnectGoogleResult) => void = () => {}
	onDisconnect.mockReturnValue(new Promise((resolve) => { finish = resolve }))
	const { user } = renderCard()
	await user.click(disconnect())
	await user.click(within(await dialog()).getByRole('button', { name: 'Disconnect' }))
	await waitFor(() => expect(disconnect()).toHaveTextContent('Disconnecting…'))
	expect(disconnect()).toBeDisabled()
	finish({ status: 'disconnected' })
	await waitFor(() => expect(disconnect()).toHaveTextContent(/^Disconnect$/))
	expect(onDisconnect).toHaveBeenCalledOnce()
})

it.each<[string, DisconnectGoogleResult | Error, string]>([
	['a refusal', { status: 'failed', message: 'Set a password first.' }, 'Set a password first.'],
	['an expired session', { status: 'session-expired', message: 'Your session has expired. Sign in again in another tab, then come back here and try again.' }, 'Your session has expired. Sign in again in another tab, then come back here and try again.'],
	['a thrown action', new Error('network'), 'Couldn’t disconnect Google. Try again.'],
])('keeps Google connected after %s and says why in the card and in a toast', async (_cause, outcome, message) => {
	if (outcome instanceof Error) onDisconnect.mockRejectedValue(outcome)
	else onDisconnect.mockResolvedValue(outcome)
	const { user } = renderCard()
	await user.click(disconnect())
	await user.click(within(await dialog()).getByRole('button', { name: 'Disconnect' }))
	expect(await within(card()).findByRole('alert')).toHaveTextContent(message)
	expect(screen.getAllByText(message).length).toBeGreaterThan(1)
	expect(row('Google')).toHaveTextContent('Google · ana@gmail.com')
	await waitFor(() => expect(disconnect()).toBeEnabled())
})

it('starts the Google flow on Connect, once, and shows the button as busy while the browser leaves', async () => {
	let finish: (result: ConnectGoogleResult) => void = () => {}
	onConnect.mockReturnValue(new Promise((resolve) => { finish = resolve }))
	const { user } = renderCard({ google: null })
	await user.click(connect())
	await waitFor(() => expect(connect()).toHaveTextContent('Connecting…'))
	expect(connect()).toBeDisabled()
	expect(onConnect).toHaveBeenCalledOnce()
	expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
	// React holds every later transition pending behind an action that never settles, so this one is settled before the next test.
	finish({ status: 'failed', message: 'Couldn’t reach Google. Try again.' })
	await waitFor(() => expect(connect()).toBeEnabled())
})

it.each<[string, ConnectGoogleResult | Error, string]>([
	['a start that failed', { status: 'failed', message: 'Couldn’t reach Google. Try again.' }, 'Couldn’t reach Google. Try again.'],
	['a thrown action', new Error('network'), 'Couldn’t reach Google. Try again.'],
])('stays on the page after %s and says why in the card and in a toast', async (_cause, outcome, message) => {
	if (outcome instanceof Error) onConnect.mockRejectedValue(outcome)
	else onConnect.mockResolvedValue(outcome)
	const { user } = renderCard({ google: null })
	await user.click(connect())
	expect(await within(card()).findByRole('alert')).toHaveTextContent(message)
	expect(screen.getAllByText(message).length).toBeGreaterThan(1)
	// The message is set inside the transition, so the button is released a render later.
	await waitFor(() => expect(connect()).toBeEnabled())
})
