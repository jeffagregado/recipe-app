import { expect, it } from 'vitest'
import { loadRecipeFilters, RecipeFilterError } from './filters'

const load = (query: string) => loadRecipeFilters(new URLSearchParams(query))

it('reads the favorites flag from the URL and leaves it off by default', () => {
	expect(load('favorites=true&sortBy=title&order=asc')).toEqual({ favorites: true, sortBy: 'title', order: 'asc' })
	expect(load('').favorites).toBeUndefined()
})

it.each(['favorites=false', 'favorites=', 'favorites=true&favorites=true'])('rejects %s', (query) => {
	expect(() => load(query)).toThrow(RecipeFilterError)
})
