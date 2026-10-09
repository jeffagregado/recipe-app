import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LogoutButton } from '@/features/auth/logout-button'
import { getSession } from '@/features/auth/queries'
import { AuthForm } from './auth-form'

export async function HomeSession() {
	const session = await getSession()
	if (session.status === 'anonymous') return <AuthForm />
	return <div className="space-y-5">
		<p className="text-lg font-medium wrap-break-word">Welcome, {session.user.displayName}</p>
		<Button className="min-h-11 w-full" render={<Link href="/recipes" />}>Open recipes</Button>
		<LogoutButton />
	</div>
}
