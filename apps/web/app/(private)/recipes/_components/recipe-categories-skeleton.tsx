import { RECIPE_CATEGORIES } from '@recipe-app/contracts/types'
import { Skeleton } from '@/components/ui/skeleton'

export function RecipeCategoriesSkeleton() {
	return <div role="status" aria-label="Loading categories" className="min-w-0 xl:flex-1">
		<span className="sr-only">Loading categories...</span>
		<div aria-hidden="true" className="flex gap-2 overflow-hidden pb-1">
			{['All', 'Favorites', ...RECIPE_CATEGORIES].map((category) => <Skeleton key={category} className="h-10 w-24 shrink-0 rounded-lg" />)}
		</div>
	</div>
}
