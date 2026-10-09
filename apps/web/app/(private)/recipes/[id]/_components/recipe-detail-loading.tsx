import { Skeleton } from '@/components/ui/skeleton'

export function RecipeDetailLoading() {
	return (
		<div role="status" aria-label="Loading recipe" className="mx-auto w-full max-w-3xl">
			<span className="sr-only">Loading recipe...</span>
			<div aria-hidden="true" className="space-y-6">
				<Skeleton className="aspect-video w-full rounded-xl" />
				<Skeleton className="h-9 w-3/4" />
				<Skeleton className="h-5 w-1/2" />
				<Skeleton className="h-32 w-full" />
			</div>
		</div>
	)
}
