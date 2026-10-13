import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** The way back to the login page from the email verification pages. */
export function LoginLink() {
	return <Link href="/" className={cn(buttonVariants({ variant: 'ghost' }), 'min-h-11 w-full')}>Back to login</Link>
}
