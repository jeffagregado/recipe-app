import { Skeleton } from '@/components/ui/skeleton'

function RowSkeleton({ height }: { height: string }) {
	return (
		<div className="grid gap-4 border-t border-border py-8 first:border-t-0 first:pt-0 md:grid-cols-3 md:gap-8">
			<div className="space-y-2">
				<Skeleton className="h-6 w-32" />
				<Skeleton className="h-4 w-48" />
			</div>
			<Skeleton className={`${height} max-w-xl rounded-2xl md:col-span-2`} />
		</div>
	)
}

/** Mirrors the rows so the page does not jump when the session arrives. */
export function SettingsLoading() {
	return (
		<div role="status" aria-busy="true">
			<span className="sr-only">Loading your settings…</span>
			<RowSkeleton height="h-24" />
			<RowSkeleton height="h-64" />
			<RowSkeleton height="h-56" />
			<RowSkeleton height="h-24" />
		</div>
	)
}
