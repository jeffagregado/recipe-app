import { GoogleAnalytics } from '@next/third-parties/google'
import { Analytics as VercelAnalytics } from '@vercel/analytics/next'
import { Suspense } from 'react'

/**
 * Analytics components for the application. Each loads only where its build-time variable is set,
 * so local, CI and test builds load no analytics script and set no analytics cookie.
 * - Google Analytics 4: needs NEXT_PUBLIC_GA_ID.
 * - Vercel Web Analytics: needs NEXT_PUBLIC_VERCEL_ENV, which Vercel sets on its builds. Its script
 *   is served only by Vercel, so elsewhere it 404s. It reads search params on the client, so it
 *   renders in Suspense. Render this inside <body>.
 */
export function Analytics() {
	const gaId = process.env.NEXT_PUBLIC_GA_ID
	const onVercel = Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV)
	return (
		<>
			{gaId ? <GoogleAnalytics gaId={gaId} /> : null}
			{onVercel ? (
				<Suspense fallback={null}>
					<VercelAnalytics />
				</Suspense>
			) : null}
		</>
	)
}
