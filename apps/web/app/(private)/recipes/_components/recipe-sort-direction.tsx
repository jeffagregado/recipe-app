'use client'

import type { RecipeFilters } from '@recipe-app/contracts/types'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'

type RecipeSortDirectionProps = {
	order: RecipeFilters['order']
	onChange: (order: RecipeFilters['order']) => void
}

export function RecipeSortDirection({ order, onChange }: RecipeSortDirectionProps) {
	const ascending = order === 'asc'
	const Icon = ascending ? ArrowUp : ArrowDown
	return <Button
		variant="outline"
		className="h-10 min-w-24"
		aria-label={ascending ? 'Switch to descending order' : 'Switch to ascending order'}
		onClick={() => onChange(ascending ? 'desc' : 'asc')}
	>
		<Icon aria-hidden="true" data-icon="inline-start" />
		{ascending ? 'Asc' : 'Desc'}
	</Button>
}
