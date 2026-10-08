import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function RecipeListSkeleton({ count = 6, label = 'Loading recipes' }: { count?: number; label?: string }) {
	const placeholders = Array.from({ length: count }, (_, index) => `placeholder-${index}`)
	return <div role="status" aria-label={label}>
		<span className="sr-only">{label}...</span>
		<div aria-hidden="true" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4">
			{placeholders.map((id) => <RecipeCardSkeleton key={id} />)}
		</div>
	</div>
}

function RecipeCardSkeleton() {
	return <Card size="sm" className="min-w-0 gap-0 rounded-[12px] py-0 shadow-recipe-card">
		<Skeleton className="aspect-video w-full rounded-none" />
		<CardContent className="flex flex-col gap-2 px-5 py-4">
			<Skeleton className="h-6 w-3/4" />
			<Skeleton className="h-5 w-20" />
			<div className="flex items-center justify-between gap-2">
				<Skeleton className="h-4 w-36" />
				<Skeleton className="size-8 rounded-full" />
			</div>
		</CardContent>
	</Card>
}
