import { render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { Analytics } from './analytics'

const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=G-TEST1234'

const scriptSources = () => Array.from(document.querySelectorAll('script')).map((script) => script.src)
const hasVercelScript = () => scriptSources().some((src) => src.includes('vercel-scripts.com'))

afterEach(() => {
	vi.unstubAllEnvs()
	for (const script of document.querySelectorAll('script')) script.remove()
})

it('loads Google Analytics when NEXT_PUBLIC_GA_ID is set', () => {
	vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST1234')
	render(<Analytics />)
	expect(scriptSources()).toContain(GTAG_SRC)
})

it.each([
	['unset', undefined],
	['empty', ''],
])('loads no Google Analytics when NEXT_PUBLIC_GA_ID is %s', (_, value) => {
	vi.stubEnv('NEXT_PUBLIC_GA_ID', value)
	render(<Analytics />)
	expect(scriptSources()).not.toContain(GTAG_SRC)
})

it.each(['production', 'preview'])('loads Vercel Analytics on a Vercel %s build', (vercelEnv) => {
	vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', vercelEnv)
	render(<Analytics />)
	expect(hasVercelScript()).toBe(true)
})

it.each([
	['unset', undefined],
	['empty', ''],
])('loads no Vercel Analytics off Vercel, when NEXT_PUBLIC_VERCEL_ENV is %s', (_, value) => {
	vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', value)
	render(<Analytics />)
	expect(hasVercelScript()).toBe(false)
})
