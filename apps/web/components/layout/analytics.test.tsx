import { render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { Analytics } from './analytics'

const GTAG_SRC = 'https://www.googletagmanager.com/gtag/js?id=G-TEST1234'

const scripts = () => Array.from(document.querySelectorAll('script'))

afterEach(() => {
	vi.unstubAllEnvs()
	for (const script of scripts()) script.remove()
})

it('loads the gtag script for the configured measurement ID', () => {
	vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TEST1234')
	render(<Analytics />)
	expect(scripts().map((script) => script.src)).toContain(GTAG_SRC)
})

it.each([
	['unset', undefined],
	['empty', ''],
])('renders nothing when NEXT_PUBLIC_GA_ID is %s', (_, value) => {
	vi.stubEnv('NEXT_PUBLIC_GA_ID', value)
	const { container } = render(<Analytics />)
	expect(container).toBeEmptyDOMElement()
	expect(scripts()).toEqual([])
})
