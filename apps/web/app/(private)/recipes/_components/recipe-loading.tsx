import { Skeleton } from '@/components/ui/skeleton'
import { RecipeCategoriesSkeleton } from './recipe-categories-skeleton'
import { RecipeListSkeleton } from './recipe-list-skeleton'

export function RecipeLoading() {
	return <div className="flex min-w-0 flex-col gap-4">
		<div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
			<RecipeCategoriesSkeleton />
			<div aria-hidden="true" className="flex gap-2 self-end xl:self-auto">
				<Skeleton className="h-10 w-44 rounded-lg" />
				<Skeleton className="h-10 w-24 rounded-lg" />
			</div>
		</div>
		<RecipeListSkeleton />
	</div>
}
