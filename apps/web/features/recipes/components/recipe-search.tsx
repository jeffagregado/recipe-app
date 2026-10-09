'use client'

import { Search } from 'lucide-react'
import { useQueryStates } from 'nuqs'
import { Input } from '@/components/ui/input'
import { recipeParsers, recipeUrlOptions } from '../lib/filters'

export function RecipeSearch() {
	const [{ search }, setFilters] = useQueryStates(recipeParsers, recipeUrlOptions)
	return <form role="search" className="relative" onSubmit={(event) => {
		event.preventDefault()
		const value = new FormData(event.currentTarget).get('search')
		if (typeof value === 'string') void setFilters({ search: value.trim() || null })
	}}>
		<button type="submit" aria-label="Submit recipe search" className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
			<Search size={20} aria-hidden="true" />
		</button>
		<Input key={search ?? ''} name="search" type="search" defaultValue={search ?? ''} maxLength={200}
			onChange={(event) => { if (event.currentTarget.value === '') void setFilters({ search: null }) }}
			aria-label="Search recipes" className="w-full pl-10" placeholder="Search recipes" />
	</form>
}
