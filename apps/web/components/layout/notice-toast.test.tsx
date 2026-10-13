import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { AppToaster } from './app-toaster'
import { NoticeToast } from './notice-toast'

const navigation = vi.hoisted(() => ({ pathname: '/recipes/abc', search: '' }))
vi.mock('next/navigation', () => ({
	usePathname: () => navigation.pathname,
	useSearchParams: () => new URLSearchParams(navigation.search),
}))

function renderNotice() {
	return render(<StrictMode><AppToaster><NoticeToast /></AppToaster></StrictMode>)
}

// Next integrates the native history methods with useSearchParams, so they are the contract: no router navigation.
const replaceState = vi.spyOn(window.history, 'replaceState')
const pushState = vi.spyOn(window.history, 'pushState')

beforeEach(() => {
	replaceState.mockClear()
	pushState.mockClear()
	navigation.pathname = '/recipes/abc'
	navigation.search = ''
	window.history.replaceState(null, '', '/recipes/abc')
	replaceState.mockClear()
})
afterEach(() => { window.history.replaceState(null, '', '/') })

it('shows the saved toast once and removes only the notice parameter without adding a history entry', () => {
	navigation.search = 'notice=recipe-saved&view=list'
	renderNotice()

	expect(screen.getAllByRole('status')).toHaveLength(1)
	expect(screen.getByRole('status')).toHaveTextContent('Recipe saved')
	expect(replaceState).toHaveBeenCalledOnce()
	expect(replaceState).toHaveBeenCalledWith(null, '', '/recipes/abc?view=list')
	expect(pushState).not.toHaveBeenCalled()
})

it.each([
	['recipe-updated', 'Recipe updated'],
	['recipe-deleted', 'Recipe deleted'],
])('maps %s to "%s"', (code, message) => {
	navigation.search = `notice=${code}`
	renderNotice()
	expect(screen.getByRole('status')).toHaveTextContent(message)
	expect(replaceState).toHaveBeenCalledWith(null, '', '/recipes/abc')
})

it.each([
	['google-sign-in-failed', 'Google sign-in did not complete. Try again.'],
	['google-email-not-verified', 'Google has not verified this email address. Verify it with Google, or sign up with a password.'],
	['google-account-not-verified', 'This email has an account that is not verified yet. Use "Forgot password?" to set a new password, which verifies it, then sign in with Google again.'],
])('announces %s as an error that stays until dismissed', (code, message) => {
	navigation.pathname = '/'
	navigation.search = `notice=${code}`
	renderNotice()
	expect(screen.getByRole('alert')).toHaveTextContent(message)
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
	expect(replaceState).toHaveBeenCalledWith(null, '', '/')
})

it('ignores an unknown code but still removes it from the URL', () => {
	navigation.search = 'notice=made-up'
	renderNotice()
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
	expect(replaceState).toHaveBeenCalledWith(null, '', '/recipes/abc')
})

it('does nothing when there is no notice', () => {
	navigation.search = 'view=list'
	renderNotice()
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
	expect(replaceState).not.toHaveBeenCalled()
})

it('shows a later notice again after the earlier one was removed from the URL', () => {
	navigation.search = 'notice=recipe-saved'
	const view = renderNotice()
	navigation.search = ''
	view.rerender(<StrictMode><AppToaster><NoticeToast /></AppToaster></StrictMode>)
	navigation.search = 'notice=recipe-saved'
	view.rerender(<StrictMode><AppToaster><NoticeToast /></AppToaster></StrictMode>)

	expect(screen.getAllByRole('status')).toHaveLength(2)
	expect(replaceState).toHaveBeenCalledTimes(2)
})
