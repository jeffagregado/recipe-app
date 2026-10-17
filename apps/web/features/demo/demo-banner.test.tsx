import { QueryClient } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppToaster } from '@/components/layout/app-toaster'
import { AUTH_CHANNEL, registerPrivateQueries } from '@/features/auth/session-client'

const action = vi.hoisted(() => ({ resetDemo: vi.fn(), startDemo: vi.fn() }))
vi.mock('./actions', () => action)

import { DemoBanner } from './demo-banner'

const replace = vi.fn()
const postMessage = vi.fn()

beforeEach(() => {
	vi.stubGlobal('location', { replace })
	vi.stubGlobal('BroadcastChannel', class { constructor(readonly name: string) { expect(name).toBe(AUTH_CHANNEL) } postMessage = postMessage; close = vi.fn() })
})
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })

const renderBanner = () => render(<AppToaster><DemoBanner /></AppToaster>)
const banner = () => screen.getByRole('region', { name: 'Demo' })

it('says the visitor is in a demo and links to the code on GitHub in a new tab', () => {
	renderBanner()
	expect(banner()).toHaveTextContent('You are using the Recapp demo. Your changes are private and last 24 hours.')
	const github = within(banner()).getByRole('link', { name: 'Code on GitHub (opens in a new tab)' })
	expect(github).toHaveAttribute('href', 'https://github.com/jeffagregado/recipe-app')
	expect(github).toHaveAttribute('target', '_blank')
	expect(github).toHaveAttribute('rel', 'noopener noreferrer')
})

it('resets after confirmation: clears private data, tells other tabs and opens the fresh account on the recipe list', async () => {
	const client = new QueryClient()
	client.setQueryData(['private'], { title: 'Edited recipe' })
	registerPrivateQueries(client)
	action.resetDemo.mockResolvedValue({ ok: true })
	renderBanner()
	await userEvent.click(within(banner()).getByRole('button', { name: 'Reset demo' }))
	const dialog = screen.getByRole('alertdialog', { name: 'Reset the demo?' })
	expect(dialog).toHaveTextContent('Your changes are discarded and you start again with the sample recipes.')
	await userEvent.click(within(dialog).getByRole('button', { name: 'Reset demo' }))
	await waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith('/recipes'))
	expect(action.resetDemo).toHaveBeenCalledOnce()
	expect(postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'login' })
	expect(client.getQueryData(['private'])).toBeUndefined()
})

it('keeps the current demo and says why when a fresh one cannot start', async () => {
	action.resetDemo.mockResolvedValue({ ok: false, code: 'DEMO_BUSY', message: 'The demo is busy right now. Please try again in a few minutes.' })
	renderBanner()
	await userEvent.click(within(banner()).getByRole('button', { name: 'Reset demo' }))
	await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reset demo' }))
	expect(await screen.findByRole('alert')).toHaveTextContent('The demo is busy right now. Please try again in a few minutes.')
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
	expect(replace).not.toHaveBeenCalled()
	expect(postMessage).not.toHaveBeenCalled()
})

it('does nothing when the confirmation is cancelled', async () => {
	renderBanner()
	await userEvent.click(within(banner()).getByRole('button', { name: 'Reset demo' }))
	await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
	await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
	expect(action.resetDemo).not.toHaveBeenCalled()
})
