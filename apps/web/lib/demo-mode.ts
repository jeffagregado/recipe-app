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
