'use client'

import { catchError, type ErrorInfo } from 'next/error'
import { useTransition } from 'react'

import PageContainer from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'

type RecipeReadErrorProps = {
	/** Set where the page has no container of its own (the edit form is full width), so the message gets the page padding. */
	contained?: boolean
	/** What failed to load, completing "Could not load …". */
	subject?: string
}

function RecipeReadError({ contained = false, subject = 'this recipe' }: RecipeReadErrorProps, { retry }: ErrorInfo) {
	const [isPending, startTransition] = useTransition()
	const alert = (
		<div role="alert" className="space-y-3">
			<p className="font-semibold">Could not load {subject}.</p>
			<p className="text-sm text-muted-foreground">Please try again in a moment.</p>
			<Button className="min-h-11" onClick={() => startTransition(() => retry())} disabled={isPending}>
				{isPending ? 'Retrying...' : 'Retry'}
			</Button>
		</div>
	)

	return contained ? <PageContainer>{alert}</PageContainer> : alert
}

export const RecipeReadErrorBoundary = catchError(RecipeReadError)
