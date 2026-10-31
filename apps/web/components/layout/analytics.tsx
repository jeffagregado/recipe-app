import { GoogleAnalytics } from '@next/third-parties/google'
import { Analytics as VercelAnalytics } from '@vercel/analytics/next'

/**
 * Analytics components for the application.
 * - Google Analytics 4: loaded only where NEXT_PUBLIC_GA_ID is set at build time, so local, CI,
 *   preview and test builds load no Google script and set no analytics cookie.
 * - Vercel Web Analytics: tracks page views and provides real-time insights in the Vercel dashboard.
 */
export function Analytics() {
	const gaId = process.env.NEXT_PUBLIC_GA_ID
	return (
		<>
			{gaId ? <GoogleAnalytics gaId={gaId} /> : null}
			<VercelAnalytics />
		</>
	)
}
