import { Skeleton } from '@/components/ui/skeleton'
import { recipeGridClassName } from './recipe-list'

export function RecipeListSkeleton({ count = 6, label = 'Loading recipes' }: { count?: number; label?: string }) {
	const placeholders = Array.from({ length: count }, (_, index) => `placeholder-${index}`)
	return <div role="status" aria-label={label}>
		<span className="sr-only">{label}...</span>
		<div aria-hidden="true" className={recipeGridClassName}>
			{placeholders.map((id) => <RecipeCardSkeleton key={id} />)}
		</div>
	</div>
}

function RecipeCardSkeleton() {
	return <div className="flex min-w-0 flex-col gap-3">
		<Skeleton className="aspect-4/3 w-full rounded-2xl" />
		<div className="flex flex-col gap-2 px-1">
			<Skeleton className="h-6 w-3/4" />
			<Skeleton className="h-4 w-32" />
			<div className="flex items-center justify-between gap-2">
				<Skeleton className="h-6 w-20 rounded-full" />
				<Skeleton className="size-9 rounded-full" />
			</div>
		</div>
	</div>
}
