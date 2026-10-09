'use client'

import { catchError, type ErrorInfo } from 'next/error'
import { useTransition } from 'react'

import { Button } from '@/components/ui/button'

function RecipeDetailError(_props: object, { retry }: ErrorInfo) {
	const [isPending, startTransition] = useTransition()

	return (
		<div role="alert" className="space-y-3">
			<p className="font-semibold">Could not load this recipe.</p>
			<p className="text-sm text-muted-foreground">Please try again in a moment.</p>
			<Button className="min-h-11" onClick={() => startTransition(() => retry())} disabled={isPending}>
				{isPending ? 'Retrying...' : 'Retry'}
			</Button>
		</div>
	)
}

export const RecipeDetailErrorBoundary = catchError(RecipeDetailError)
