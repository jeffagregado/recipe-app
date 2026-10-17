import { render, screen } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

// The image optimizer needs a server; render a plain img instead.
vi.mock('next/image', () => ({
	// eslint-disable-next-line @next/next/no-img-element
	default: ({ alt }: ImgHTMLAttributes<HTMLImageElement>) => <img alt={alt} />,
}))
// The session-dependent parts stream in behind Suspense; their own tests cover them.
vi.mock('./_components/landing-session', () => ({ LandingSession: () => null }))
vi.mock('@/features/demo/demo-start-actions', () => ({ DemoStartActions: () => null }))
vi.mock('@/components/layout/notice-toast', () => ({ NoticeToast: () => null }))

import HomePage from './page'

afterEach(() => { vi.unstubAllEnvs() })

it('is the demo start page on the demo site', () => {
	vi.stubEnv('DEMO_MODE', 'true')
	render(<HomePage />)
	expect(screen.getByRole('heading', { level: 1, name: 'Try Recapp' })).toBeInTheDocument()
	expect(screen.queryByRole('heading', { name: 'My Recipes' })).not.toBeInTheDocument()
})

it('is the landing page on the main site, with no demo', () => {
	vi.stubEnv('DEMO_MODE', '')
	render(<HomePage />)
	expect(screen.getByRole('heading', { level: 1, name: 'My Recipes' })).toBeInTheDocument()
	expect(screen.queryByRole('heading', { name: 'Try Recapp' })).not.toBeInTheDocument()
})
