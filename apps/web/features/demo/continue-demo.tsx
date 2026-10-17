import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { getSession } from '@/features/auth/queries'
import { cn } from '@/lib/utils'

/** A visitor still signed in to a Demo account gets it back. A failed session read hides the link and leaves Start demo working. */
export async function ContinueDemo() {
	const session = await getSession().catch(() => null)
	if (session?.status !== 'authenticated') return null
	return <Link href="/recipes" className={cn(buttonVariants({ variant: 'outline' }), 'h-11 w-full text-base')}>Continue your demo</Link>
}
