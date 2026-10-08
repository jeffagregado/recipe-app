'use client'

import { catchError, type ErrorInfo } from 'next/error'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'

function RecipeError({ message }: { message: string }, { retry }: ErrorInfo) {
	const [isPending, startTransition] = useTransition()

	return (
		<div role="alert" className="space-y-3">
			<p className="font-semibold">Could not load recipes.</p>
			<p className="text-sm text-muted-foreground wrap-break-word">{message}</p>
			<Button onClick={() => startTransition(() => retry())} disabled={isPending}>
				{isPending ? 'Retrying...' : 'Retry'}
			</Button>
		</div>
	)
}

export const RecipeErrorBoundary = catchError(RecipeError)
