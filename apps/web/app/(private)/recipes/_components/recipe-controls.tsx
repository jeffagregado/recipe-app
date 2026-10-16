'use client'

import type { Category, RecipeCounts, RecipeFilters } from '@recipe-app/contracts/types'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { RecipeSortDirection } from './recipe-sort-direction'

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

/** The category row is a single choice: every recipe, favorites, or one category. */
export type RecipeChoice = Pick<RecipeFilters, 'category' | 'favorites'>

type RecipeChip = { key: string; label: string; choice: RecipeChoice; pressed: boolean; total?: number }

type RecipeControlsProps = {
	/** The user's own categories in their order; with none, the row is All and Favorites only. */
	categories: Category[]
	filters: RecipeFilters
	counts?: RecipeCounts
	loading: boolean
	onFilter: (choice: RecipeChoice) => void
	onSort: (sort: Pick<RecipeFilters, 'sortBy' | 'order'>) => void
}

export function RecipeControls({ categories, filters, counts, loading, onFilter, onSort }: RecipeControlsProps) {
	const chips: RecipeChip[] = [
		{ key: 'all', label: 'All', choice: {}, pressed: !filters.category && !filters.favorites, total: counts?.total },
		{ key: 'favorites', label: 'Favorites', choice: { favorites: true }, pressed: filters.favorites === true, total: counts?.favorites },
		// Keyed and counted by id: a user may name a category "All", and names change while ids do not.
		...categories.map(({ id, name }) => ({
			key: `category:${id}`, label: name, choice: { category: id }, pressed: filters.category === id,
			total: counts?.categories.find((category) => category.id === id)?.total,
		})),
	]
	return <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
		<div role="group" aria-label="Recipe categories" aria-busy={loading} className="flex min-w-0 gap-2 overflow-x-auto pb-1 xl:flex-1">
			{chips.map((chip) => <Button
				key={chip.key}
				variant={chip.pressed ? 'default' : 'secondary'}
				aria-pressed={chip.pressed}
				onClick={() => onFilter(chip.choice)}
				className="h-10 shrink-0 gap-1.5 rounded-full px-4 motion-safe:active:scale-[0.98]"
			>
				{chip.label}
				{chip.total !== undefined ? <span className="rounded-full bg-foreground/10 px-1.5 text-xs tabular-nums">
					{chip.total}
				</span> : loading && <Skeleton aria-hidden="true" className="h-4 w-6 rounded-full" />}
			</Button>)}
		</div>
		<div role="group" aria-label="Recipe sorting" className="flex gap-2 self-end xl:self-auto">
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="outline" className="h-10" />} aria-label="Sort recipes">
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
			<RecipeSortDirection order={filters.order} onChange={(order) => onSort({ sortBy: filters.sortBy, order })} />
		</div>
	</div>
}
