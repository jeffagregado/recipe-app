import { Skeleton } from '@/components/ui/skeleton'

function PanelSkeleton({ rows }: { rows: number }) {
	return (
		<div className="space-y-4 rounded-2xl bg-accent/50 p-4 sm:p-5">
			<Skeleton className="h-6 w-32" />
			{Array.from({ length: rows }, (_, row) => <Skeleton key={row} className="h-6 w-full" />)}
		</div>
	)
}

function StepsSkeleton({ rows }: { rows: number }) {
	return (
		<div className="space-y-6">
			<Skeleton className="h-6 w-32" />
			{Array.from({ length: rows }, (_, row) => (
				<div key={row} className="flex gap-4">
					<Skeleton className="size-9 shrink-0 rounded-full" />
					<Skeleton className="h-14 w-full" />
				</div>
			))}
		</div>
	)
}

/** Shaped like the recipe page: cover beside the title row and meta from `lg`, then the two columns from `xl`. */
export function RecipeDetailLoading() {
	return (
		<div role="status" aria-label="Loading recipe" className="w-full">
			<span className="sr-only">Loading recipe...</span>
			<div aria-hidden="true" className="space-y-8 lg:space-y-10">
				<div className="grid gap-5 lg:grid-cols-12 lg:items-center lg:gap-8">
					<Skeleton className="aspect-4/3 w-full rounded-2xl lg:col-span-5" />
					<div className="space-y-4 lg:col-span-7">
						<Skeleton className="h-10 w-3/4" />
						<Skeleton className="h-6 w-1/2" />
						<Skeleton className="h-6 w-full" />
					</div>
				</div>
				<div className="grid gap-8 xl:grid-cols-12 xl:items-start xl:gap-10">
					<div className="space-y-6 xl:col-span-5">
						<PanelSkeleton rows={4} />
					</div>
					<div className="xl:col-span-7">
						<StepsSkeleton rows={3} />
					</div>
				</div>
			</div>
		</div>
	)
}
