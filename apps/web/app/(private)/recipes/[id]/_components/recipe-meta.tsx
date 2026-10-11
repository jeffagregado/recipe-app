import type { Category } from '@recipe-app/contracts/types'
import { Clock, User } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { recipeTimes, servingsLabel } from '../_lib/recipe-detail-format'

type RecipeMetaProps = {
	categories: Category[]
	prepTimeMinutes: number | null
	cookTimeMinutes: number | null
	servings: number | null
}

/** Category chips, then times and servings. Every part is omitted when the recipe has no value for it. */
export function RecipeMeta({ categories, prepTimeMinutes, cookTimeMinutes, servings }: RecipeMetaProps) {
	const times = recipeTimes({ prepTimeMinutes, cookTimeMinutes })
	const hasDetails = times.length > 0 || servings !== null
	if (categories.length === 0 && !hasDetails) return null

	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-2">
			{categories.length > 0 && (
				<ul aria-label="Categories" className="flex flex-wrap gap-1.5">
					{categories.map((category) => (
						<li key={category.id}><Badge variant="category">{category.name}</Badge></li>
					))}
				</ul>
			)}
			{hasDetails && (
				<ul aria-label="Recipe details" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
					{times.length > 0 && (
						<li className="flex items-center gap-1.5">
							<Clock aria-hidden="true" className="size-4 shrink-0" />
							<span className="flex flex-wrap items-center sm:gap-x-3">
								{times.map(({ label, minutes }, index) => (
									<span key={label} className="inline-flex items-baseline">
										{index > 0 && <span aria-hidden="true" className="px-1.5 sm:hidden">·</span>}
										<span className={label === 'Total' ? 'font-semibold text-foreground' : undefined}>
											{label} {minutes}
											{/* On mobile only the last time shows "min"; the others keep it for screen readers. */}
											<span className={index === times.length - 1 ? undefined : 'max-sm:sr-only'}> min</span>
										</span>
									</span>
								))}
							</span>
						</li>
					)}
					{servings !== null && (
						<li className="flex items-center gap-1.5">
							<User aria-hidden="true" className="size-4 shrink-0" />
							<span>{servingsLabel(servings)}</span>
						</li>
					)}
				</ul>
			)}
		</div>
	)
}
