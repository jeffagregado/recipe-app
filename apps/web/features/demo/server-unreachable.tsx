'use client'

import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'

/** The start page when it could not tell whether the visitor still has a demo. */
export function ServerUnreachable() {
	const router = useRouter()
	const [pending, startTransition] = useTransition()
	return (
		<div className="space-y-3">
			<p role="alert" className="text-sm font-medium text-destructive">Couldn’t reach the server. It may still be waking up.</p>
			<Button type="button" className="h-11 w-full px-5 text-base" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
				{pending && <Loader2 aria-hidden="true" className="animate-spin" />}
				{pending ? 'Trying again…' : 'Try again'}
			</Button>
		</div>
	)
}
