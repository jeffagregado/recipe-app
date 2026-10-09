import PageContainer from '@/components/layout/page-container'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors the form's header and card layout so the page does not jump when the session check finishes. */
export function CreateRecipeLoading() {
	return (
		<div role="status" aria-busy="true">
			<span className="sr-only">Loading the recipe form…</span>
			<div className="border-b border-border bg-background">
				<div className="mx-auto flex h-15 w-full max-w-360 items-center justify-between gap-4 px-4 sm:px-5 md:h-20 lg:px-6 xl:px-8">
					<Skeleton className="h-6 w-40" />
					<Skeleton className="h-11 w-28" />
				</div>
			</div>
			<PageContainer className="grid gap-4 sm:gap-5 xl:grid-cols-12 xl:items-start">
				<div className="space-y-4 sm:space-y-5 xl:col-span-5">
					<Skeleton className="h-96 rounded-xl" />
					<Skeleton className="h-40 rounded-xl" />
				</div>
				<div className="space-y-4 sm:space-y-5 xl:col-span-7">
					<Skeleton className="h-64 rounded-xl" />
					<Skeleton className="h-64 rounded-xl" />
				</div>
			</PageContainer>
		</div>
	)
}
