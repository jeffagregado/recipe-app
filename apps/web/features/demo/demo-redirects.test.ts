import { expect, it } from 'vitest'
import { demoRedirects } from './demo-redirects'

it('sends every auth page of the demo site to the start page, temporarily', () => {
	expect(demoRedirects(true)).toEqual([
		{ source: '/auth/login', destination: '/', permanent: false },
		{ source: '/check-email', destination: '/', permanent: false },
		{ source: '/verify-email/:rest*', destination: '/', permanent: false },
		{ source: '/forgot-password', destination: '/', permanent: false },
		{ source: '/reset-password', destination: '/', permanent: false },
		{ source: '/confirm-email-change', destination: '/', permanent: false },
	])
})

it('redirects nothing on the main site', () => {
	expect(demoRedirects(false)).toEqual([])
})
