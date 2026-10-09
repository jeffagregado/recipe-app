import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'

import { AppToaster } from './app-toaster'
import { NoticeToast } from './notice-toast'

const navigation = vi.hoisted(() => ({ replace: vi.fn(), pathname: '/recipes/abc', search: '' }))
vi.mock('next/navigation', () => ({
	useRouter: () => ({ replace: navigation.replace }),
	usePathname: () => navigation.pathname,
	useSearchParams: () => new URLSearchParams(navigation.search),
}))

function renderNotice() {
	return render(<StrictMode><AppToaster><NoticeToast /></AppToaster></StrictMode>)
}

beforeEach(() => {
	navigation.replace.mockReset()
	navigation.pathname = '/recipes/abc'
	navigation.search = ''
	window.location.hash = ''
})

it('shows the saved toast once and removes only the notice parameter without scrolling', () => {
	navigation.search = 'notice=recipe-saved&view=list'
	renderNotice()

	expect(screen.getAllByRole('status')).toHaveLength(1)
	expect(screen.getByRole('status')).toHaveTextContent('Recipe saved')
	expect(navigation.replace).toHaveBeenCalledOnce()
	expect(navigation.replace).toHaveBeenCalledWith('/recipes/abc?view=list', { scroll: false })
})

it.each([
	['recipe-updated', 'Recipe updated'],
	['recipe-deleted', 'Recipe deleted'],
])('maps %s to "%s"', (code, message) => {
	navigation.search = `notice=${code}`
	renderNotice()
	expect(screen.getByRole('status')).toHaveTextContent(message)
	expect(navigation.replace).toHaveBeenCalledWith('/recipes/abc', { scroll: false })
})

it('ignores an unknown code but still removes it from the URL', () => {
	navigation.search = 'notice=made-up'
	renderNotice()
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
	expect(navigation.replace).toHaveBeenCalledWith('/recipes/abc', { scroll: false })
})

it('does nothing when there is no notice', () => {
	navigation.search = 'view=list'
	renderNotice()
	expect(screen.queryByRole('status')).not.toBeInTheDocument()
	expect(navigation.replace).not.toHaveBeenCalled()
})

it('shows a later notice again after the earlier one was removed from the URL', () => {
	navigation.search = 'notice=recipe-saved'
	const view = renderNotice()
	navigation.search = ''
	view.rerender(<StrictMode><AppToaster><NoticeToast /></AppToaster></StrictMode>)
	navigation.search = 'notice=recipe-saved'
	view.rerender(<StrictMode><AppToaster><NoticeToast /></AppToaster></StrictMode>)

	expect(screen.getAllByRole('status')).toHaveLength(2)
	expect(navigation.replace).toHaveBeenCalledTimes(2)
})
