'use client'

import { catchError, type ErrorInfo } from 'next/error'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'

function SessionError(_props: { message?: string }, { retry }: ErrorInfo) {
	const [pending, startTransition] = useTransition()
	return <div role="alert" className="space-y-3">
		<p className="font-semibold">Could not check your session.</p>
		<p className="text-sm text-muted-foreground">Authentication is unavailable. Please try again.</p>
		<Button className="min-h-11" disabled={pending} onClick={() => startTransition(() => retry())}>{pending ? 'Retrying...' : 'Retry'}</Button>
	</div>
}

export const SessionErrorBoundary = catchError(SessionError)
