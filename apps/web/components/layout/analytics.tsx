import { GoogleAnalytics } from '@next/third-parties/google'
import { Analytics as VercelAnalytics } from '@vercel/analytics/next'
import { Suspense } from 'react'

/**
 * Analytics components for the application.
 * - Google Analytics 4: loaded only where NEXT_PUBLIC_GA_ID is set at build time, so local, CI,
 *   preview and test builds load no Google script and set no analytics cookie.
 * - Vercel Web Analytics: tracks page views and provides real-time insights in the Vercel dashboard.
 *   It reads search params on the client, so it renders in Suspense. Render this inside <body>.
 */
export function Analytics() {
	const gaId = process.env.NEXT_PUBLIC_GA_ID
	return (
		<>
			{gaId ? <GoogleAnalytics gaId={gaId} /> : null}
			<Suspense fallback={null}>
				<VercelAnalytics />
			</Suspense>
		</>
	)
}
