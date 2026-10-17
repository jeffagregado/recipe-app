'use client'

import { Loader2 } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { startDemo, type DemoStartFailure } from './actions'

/** How long a start may take before the page explains Render's cold start. A warm API answers in about a second. */
const WAKING_UP_AFTER_MS = 3_000
const START_FAILED = 'The demo could not start. Please try again.'

/** Start demo: success leaves for the recipe list; a refusal stays here as a message. */
export function StartDemoButton({ onStart = startDemo }: { onStart?: () => Promise<DemoStartFailure> }) {
	const [pending, startTransition] = useTransition()
	const [wakingUp, setWakingUp] = useState(false)
	const [message, setMessage] = useState<string>()

	function start() {
		setMessage(undefined)
		const timer = setTimeout(() => setWakingUp(true), WAKING_UP_AFTER_MS)
		startTransition(async () => {
			let result: string
			try { result = (await onStart()).message }
			catch (error) {
				// A Next action redirect rejects its promise; preserve that framework control flow.
				unstable_rethrow(error)
				result = START_FAILED
			}
			clearTimeout(timer)
			setWakingUp(false)
			setMessage(result)
		})
	}

	return (
		<div className="space-y-3">
			<Button type="button" className="h-11 w-full px-5 text-base motion-safe:active:scale-[0.98]" disabled={pending} onClick={start}>
				{pending && <Loader2 aria-hidden="true" className="animate-spin" />}
				{pending ? 'Starting demo…' : 'Start demo'}
			</Button>
			<p role="status" className="text-center text-sm text-muted-foreground empty:hidden">{wakingUp ? 'Waking up the server…' : ''}</p>
			{message && <p role="alert" className="text-sm font-medium text-destructive wrap-break-word">{message}</p>}
		</div>
	)
}
