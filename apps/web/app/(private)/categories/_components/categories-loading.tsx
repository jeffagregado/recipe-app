import PageContainer from '@/components/layout/page-container'
import { Skeleton } from '@/components/ui/skeleton'

/** Mirrors the form's header and card so the page does not jump when the categories arrive. */
export function CategoriesLoading() {
	return (
		<div role="status" aria-busy="true">
			<span className="sr-only">Loading your categories…</span>
			<div className="border-b border-border bg-background">
				<div className="mx-auto flex h-15 w-full max-w-360 items-center justify-between gap-4 px-4 sm:px-5 md:h-20 lg:px-6 xl:px-8">
					<Skeleton className="h-6 w-40" />
					<Skeleton className="h-11 w-28" />
				</div>
			</div>
			<PageContainer>
				<Skeleton className="h-96 max-w-xl rounded-xl" />
			</PageContainer>
		</div>
	)
}
