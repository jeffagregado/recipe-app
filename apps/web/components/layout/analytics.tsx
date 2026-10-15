import { GoogleAnalytics } from '@next/third-parties/google'

/**
 * Google Analytics 4 for every page, loaded only where NEXT_PUBLIC_GA_ID is set at build time, so local, CI,
 * preview and test builds load no Google script and set no analytics cookie.
 */
export function Analytics() {
	const gaId = process.env.NEXT_PUBLIC_GA_ID
	return gaId ? <GoogleAnalytics gaId={gaId} /> : null
}
