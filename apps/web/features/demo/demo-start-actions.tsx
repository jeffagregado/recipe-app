import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { getSession } from '@/features/auth/queries'
import { cn } from '@/lib/utils'
import { ServerUnreachable } from './server-unreachable'
import { StartDemoButton } from './start-demo-button'

/**
 * Start demo, plus the visitor's own demo back while they are still signed in to it. A visitor without a session cookie
 * is answered without asking the API. When the check itself fails, as during Render's cold start, only Try again is
 * offered: Start demo would replace the cookie of a demo the visitor may still have.
 */
export async function DemoStartActions() {
	const status = await getSession().then(({ status }) => status, () => 'unreachable' as const)
	if (status === 'unreachable') return <ServerUnreachable />
	return (
		<div className="space-y-3">
			<StartDemoButton />
			{status === 'authenticated' && <Link href="/recipes" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full text-base')}>Continue your demo</Link>}
		</div>
	)
}
