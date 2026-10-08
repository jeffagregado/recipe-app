'use client'

import { RECIPE_CATEGORIES } from '@recipe-app/contracts/types'
import type { RecipeCategory, RecipeCounts, RecipeFilters } from '@recipe-app/contracts/types'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const sorts = [
	{ label: 'Newest first', sortBy: 'createdAt', order: 'desc' },
	{ label: 'Oldest first', sortBy: 'createdAt', order: 'asc' },
	{ label: 'Recently updated', sortBy: 'updatedAt', order: 'desc' },
	{ label: 'Title A-Z', sortBy: 'title', order: 'asc' },
	{ label: 'Title Z-A', sortBy: 'title', order: 'desc' },
] as const

const sortLabels = {
	createdAt: { asc: 'Oldest first', desc: 'Newest first' },
	updatedAt: { asc: 'Updated oldest first', desc: 'Recently updated' },
	title: { asc: 'Title A-Z', desc: 'Title Z-A' },
}

type RecipeControlsProps = {
	filters: RecipeFilters
	counts?: RecipeCounts
	onCategory: (category: RecipeCategory | null) => void
	onSort: (sort: Pick<RecipeFilters, 'sortBy' | 'order'>) => void
}

export function RecipeControls({ filters, counts, onCategory, onSort }: RecipeControlsProps) {
	const categories = [{ label: 'All', value: undefined, total: counts?.total },
		...RECIPE_CATEGORIES.map((value) => ({ label: value, value, total: counts?.categories[value] })),
	]
	return <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
		<div role="group" aria-label="Recipe categories" className="flex min-w-0 gap-2 overflow-x-auto pb-1 xl:flex-1">
			{categories.map((category) => <Button
				key={category.label}
				variant={filters.category === category.value ? 'default' : 'secondary'}
				aria-pressed={filters.category === category.value}
				onClick={() => onCategory(category.value ?? null)}
				className="h-10 shrink-0 gap-1.5 px-3"
			>
				{category.label}
				<span className="rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums">
					{category.total ?? '…'}
				</span>
			</Button>)}
		</div>
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" className="h-10 self-end xl:self-auto" />} aria-label="Sort recipes">
				{sortLabels[filters.sortBy][filters.order]} <ChevronDown aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-44">
				<DropdownMenuRadioGroup value={`${filters.sortBy}:${filters.order}`}>
					{sorts.map((sort) => <DropdownMenuRadioItem key={sort.label} value={`${sort.sortBy}:${sort.order}`} onClick={() => onSort({ sortBy: sort.sortBy, order: sort.order })}>
						{sort.label}
					</DropdownMenuRadioItem>)}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	</div>
}
