'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { logout } from './actions'
import { broadcastAuth, leavePrivateSession } from './session-client'

export function LogoutButton() {
	const [pending, startTransition] = useTransition()
	const [error, setError] = useState<string>()
	return <div className="space-y-2">
		<Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => {
			setError(undefined)
			startTransition(async () => {
				let result
				try { result = await logout() } catch { setError('Could not confirm logout. Please try again.'); return }
				if (!result.ok) { setError(result.message); return }
				broadcastAuth('logout')
				leavePrivateSession()
			})
		}}>{pending ? 'Logging out...' : 'Log out'}</Button>
		{pending && <p role="status" className="text-sm text-muted-foreground">Logging out...</p>}
		{error && <p role="alert" className="text-sm text-destructive wrap-break-word">{error}</p>}
	</div>
}
