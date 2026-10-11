import { expect, it } from 'vitest'
import { loadRecipeFilters, RecipeFilterError } from './filters'

const categories = [{ id: 'category-dinner', name: 'Dinner' }]
const load = (query: string) => loadRecipeFilters(new URLSearchParams(query), categories)

it('reads the favorites flag from the URL and leaves it off by default', () => {
	expect(load('favorites=true&sortBy=title&order=asc')).toEqual({ filters: { favorites: true, sortBy: 'title', order: 'asc' }, ignoredCategory: false })
	expect(load('').filters.favorites).toBeUndefined()
})

it.each([
	['blank', 'category='],
	['repeated', 'category=category-dinner&category=category-dinner'],
	['unknown', 'category=missing-category'],
	['foreign', 'category=other-users-category'],
])('ignores a %s category', (_kind, query) => {
	expect(load(query)).toEqual({ filters: { sortBy: 'createdAt', order: 'desc' }, ignoredCategory: true })
	expect(load(query).filters.category).toBeUndefined()
})

it('loads a known category id without ignoring it', () => {
	expect(load('category=category-dinner')).toEqual({ filters: { category: 'category-dinner', sortBy: 'createdAt', order: 'desc' }, ignoredCategory: false })
})

it('does not ignore an absent category parameter', () => {
	expect(load('').ignoredCategory).toBe(false)
})

it.each(['favorites=false', 'favorites=', 'favorites=true&favorites=true'])('rejects %s', (query) => {
	expect(() => load(query)).toThrow(RecipeFilterError)
})
