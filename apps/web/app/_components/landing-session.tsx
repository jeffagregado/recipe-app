import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getSession } from '@/features/auth/queries'

type LandingSessionProps = {
	/** `header` offers Log in and Get started; `hero` and `band` repeat the one primary call. A signed-in visitor gets Open recipes everywhere. */
	placement?: 'header' | 'hero' | 'band'
}

const primary = 'h-11 px-5 text-base motion-safe:active:scale-[0.98]'

export async function LandingSession({ placement = 'header' }: LandingSessionProps = {}) {
	const session = await getSession()
	const onPhoto = placement === 'band'
	if (session.status === 'authenticated') {
		return <Link href="/recipes" className={cn(buttonVariants({ variant: onPhoto ? 'secondary' : 'default' }), primary)}>Open recipes</Link>
	}
	if (placement === 'header') {
		return <div className="flex items-center gap-2">
			<Link href="/auth/login" className={cn(buttonVariants({ variant: 'ghost' }), 'h-11 px-4 text-base')}>Log in</Link>
			<Link href="/auth/login" className={cn(buttonVariants(), 'h-11 px-4 text-base motion-safe:active:scale-[0.98]')}>Get started</Link>
		</div>
	}
	return <Link href="/auth/login" className={cn(buttonVariants({ variant: onPhoto ? 'secondary' : 'default' }), primary)}>Get started</Link>
}
