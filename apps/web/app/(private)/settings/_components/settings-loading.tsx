import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors the display name card so the page does not jump when the session arrives. */
export function SettingsLoading() {
	return (
		<div role="status" aria-busy="true">
			<span className="sr-only">Loading your settings…</span>
			<Skeleton className="h-44 max-w-xl rounded-xl" />
		</div>
	)
}
