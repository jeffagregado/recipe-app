import { Skeleton } from '@/components/ui/skeleton'

/** All, Favorites and the five defaults; the real count is only known once the categories have loaded. */
const PLACEHOLDERS = ['all', 'favorites', 'first', 'second', 'third', 'fourth', 'fifth']

export function RecipeCategoriesSkeleton() {
	return <div role="status" aria-label="Loading categories" className="min-w-0 xl:flex-1">
		<span className="sr-only">Loading categories...</span>
		<div aria-hidden="true" className="flex gap-2 overflow-hidden pb-1">
			{PLACEHOLDERS.map((chip) => <Skeleton key={chip} className="h-10 w-24 shrink-0 rounded-lg" />)}
		</div>
	</div>
}
