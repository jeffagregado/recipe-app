'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { useDemoMode } from '@/features/demo/demo-mode-context'
import { logout } from './actions'
import { broadcastAuth, leavePrivateSession } from './session-client'

export function LogoutButton() {
	const [pending, startTransition] = useTransition()
	const [error, setError] = useState<string>()
	// A Demo account has no way back in, so leaving it ends the demo.
	const [idle, busy] = useDemoMode() ? ['End demo', 'Ending demo...'] : ['Log out', 'Logging out...']
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
		}}><span aria-live="polite">{pending ? busy : idle}</span></Button>
		{error && <p role="alert" className="text-sm text-destructive wrap-break-word">{error}</p>}
	</div>
}
