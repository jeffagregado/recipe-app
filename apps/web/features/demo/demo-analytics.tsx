import { Analytics } from '@vercel/analytics/next'
import { isDemoMode } from '@/lib/demo-mode'

/** Vercel Analytics visit counts on the demo site only; the main site keeps its own analytics unchanged. */
export function DemoAnalytics() {
	return isDemoMode() ? <Analytics /> : null
}
