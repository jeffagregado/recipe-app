/**
 * The live demo switch (issue #112): `true` builds the demo site, while empty, unset or `false` builds the main site
 * unchanged. Give the build and the server the same value: prerendered pages and the auth redirects are set at build time.
 * Any other value stops configuration loading, so a typo cannot ship the wrong site.
 */
export function parseDemoMode(value: string | undefined): boolean {
	const mode = value?.trim()
	if (!mode || mode === 'false') return false
	if (mode === 'true') return true
	throw new Error('DEMO_MODE must be true, false or empty.')
}

/** Server-only reading of the switch. Client components get it from `useDemoMode`. */
export const isDemoMode = () => parseDemoMode(process.env.DEMO_MODE)

/** Every page that needs email, a password or Google. `:rest*` also covers the bare path. */
const AUTH_PAGES = ['/auth/login', '/check-email', '/verify-email/:rest*', '/forgot-password', '/reset-password', '/confirm-email-change']

/** On the demo site the auth pages redirect to its start page, so a visitor never reaches a form that cannot work. */
export function demoRedirects(demo: boolean) {
	return demo ? AUTH_PAGES.map((source) => ({ source, destination: '/', permanent: false })) : []
}
