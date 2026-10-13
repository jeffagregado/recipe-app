import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors the cards so the page does not jump when the session arrives. */
export function SettingsLoading() {
	return (
		<div role="status" aria-busy="true" className="space-y-4 sm:space-y-5">
			<span className="sr-only">Loading your settings…</span>
			<Skeleton className="h-44 max-w-xl rounded-xl" />
			<Skeleton className="h-72 max-w-xl rounded-xl" />
			<Skeleton className="h-44 max-w-xl rounded-xl" />
		</div>
	)
}
