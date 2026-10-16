import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LogoutButton } from '@/features/auth/logout-button'
import { getSession } from '@/features/auth/queries'
import { AuthForm } from './auth-form'

export async function HomeSession() {
	const session = await getSession()
	if (session.status === 'anonymous') return <AuthForm />
	return <div className="space-y-5">
		<p className="text-lg font-medium wrap-break-word">Welcome, {session.user.displayName}</p>
		<Link href="/recipes" className={cn(buttonVariants(), 'min-h-11 w-full')}>Open recipes</Link>
		<LogoutButton />
	</div>
}
