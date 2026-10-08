'use client'

import { Button } from '@/components/ui/button'

type RecipeRequestErrorProps = {
	error: Error | null
	laterPage: boolean
	pending: boolean
	onRetry: () => void
}

export function RecipeRequestError({ error, laterPage, pending, onRetry }: RecipeRequestErrorProps) {
	if (!error) return null
	return <div role="alert" className="space-y-3">
		<p className="font-semibold">{laterPage ? 'Could not load more recipes.' : 'Could not load recipes.'}</p>
		<p className="text-sm text-muted-foreground wrap-break-word">{error.message}</p>
		<Button disabled={pending} onClick={onRetry}>{pending ? 'Retrying...' : 'Retry'}</Button>
	</div>
}
