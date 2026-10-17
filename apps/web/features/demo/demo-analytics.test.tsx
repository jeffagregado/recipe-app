import { render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DemoAnalytics } from './demo-analytics'

const scripts = () => Array.from(document.querySelectorAll('script'))

afterEach(() => {
	vi.unstubAllEnvs()
	for (const script of scripts()) script.remove()
})

it('loads Vercel Analytics on the demo site', () => {
	vi.stubEnv('DEMO_MODE', 'true')
	render(<DemoAnalytics />)
	// Outside production builds the package loads its debug script; deployed, it is /_vercel/insights/script.js.
	expect(scripts().map((script) => script.src)).toEqual(['https://va.vercel-scripts.com/v1/script.debug.js'])
})

it.each([undefined, '', 'false'])('loads nothing when DEMO_MODE is %j, as on the main site', (value) => {
	vi.stubEnv('DEMO_MODE', value)
	const { container } = render(<DemoAnalytics />)
	expect(container).toBeEmptyDOMElement()
	expect(scripts()).toEqual([])
})
