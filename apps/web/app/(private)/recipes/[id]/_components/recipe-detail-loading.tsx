import { Skeleton } from '@/components/ui/skeleton'

function CardSkeleton({ rows }: { rows: number }) {
	return (
		<div className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
			<Skeleton className="h-5 w-32" />
			{Array.from({ length: rows }, (_, row) => <Skeleton key={row} className="h-6 w-full" />)}
		</div>
	)
}

/** Shaped like the recipe page: banner, title row, meta, then the two columns from `xl`. */
export function RecipeDetailLoading() {
	return (
		<div role="status" aria-label="Loading recipe" className="w-full">
			<span className="sr-only">Loading recipe...</span>
			<div aria-hidden="true" className="space-y-4 sm:space-y-5">
				<Skeleton className="aspect-8/5 w-full rounded-xl sm:aspect-2/1 lg:aspect-[3.8/1]" />
				<Skeleton className="h-9 w-3/4" />
				<Skeleton className="h-6 w-1/2" />
				<div className="grid gap-4 sm:gap-5 xl:grid-cols-12 xl:items-start">
					<div className="space-y-4 sm:space-y-5 xl:col-span-5">
						<CardSkeleton rows={4} />
						<CardSkeleton rows={3} />
					</div>
					<div className="space-y-4 sm:space-y-5 xl:col-span-7">
						<CardSkeleton rows={5} />
					</div>
				</div>
			</div>
		</div>
	)
}
