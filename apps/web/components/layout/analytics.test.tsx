import { render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { Analytics } from './analytics'

const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=G-TEST1234'

const scripts = () => Array.from(document.querySelectorAll('script'))

afterEach(() => {
	vi.unstubAllEnvs()
	for (const script of scripts()) script.remove()
})

it('loads both Google Analytics and Vercel Analytics when GA is configured', () => {
	vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST1234')
	render(<Analytics />)
	const scriptSources = scripts().map((script) => script.src)
	// Google Analytics script should be present
	expect(scriptSources).toContain(GTAG_SRC)
	// Vercel Analytics script should be present
	const vercelScript = scripts().find((script) => script.src.includes('vercel-scripts.com'))
	expect(vercelScript).toBeDefined()
})

it.each([
	['unset', undefined],
	['empty', ''],
])('renders only Vercel Analytics when NEXT_PUBLIC_GA_ID is %s', (_, value) => {
	vi.stubEnv('NEXT_PUBLIC_GA_ID', value)
	render(<Analytics />)
	// Vercel Analytics script should be present
	const vercelScript = scripts().find((script) => script.src.includes('vercel-scripts.com'))
	expect(vercelScript).toBeDefined()
	// Google Analytics script should not be present
	expect(scripts().map((script) => script.src)).not.toContain(GTAG_SRC)
})
