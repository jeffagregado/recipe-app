import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LoginLink } from './login-link'

/** What the reset page shows in place of its form when the link cannot be used: a way to ask for another one. */
export function ResetLinkExpired() {
	return (
		<div className="space-y-4">
			<p role="alert" className="text-sm wrap-break-word">This link has expired or was already used.</p>
			<Link href="/forgot-password" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 w-full')}>Request a new link</Link>
			<LoginLink />
		</div>
	)
}
