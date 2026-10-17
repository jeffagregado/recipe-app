/** Every page that needs email, a password or Google. `:rest*` also covers the bare path. */
const AUTH_PAGES = ['/auth/login', '/check-email', '/verify-email/:rest*', '/forgot-password', '/reset-password', '/confirm-email-change']

/** On the demo site the auth pages redirect to its start page, so a visitor never reaches a form that cannot work. */
export function demoRedirects(demo: boolean) {
	return demo ? AUTH_PAGES.map((source) => ({ source, destination: '/', permanent: false })) : []
}
