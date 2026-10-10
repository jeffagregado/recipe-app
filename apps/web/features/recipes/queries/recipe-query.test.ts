import { expect, it } from 'vitest'
import { recipeQueryOptions } from './recipe-query'

it('separates owners, endpoints, filters and page settings', () => {
	const filters = { sortBy: 'title', order: 'asc', search: 'rice', category: 'Dinner' } as const
	const first = recipeQueryOptions('owner-a', '/backend/recipes', filters)
	const second = recipeQueryOptions('owner-b', '/backend/recipes', filters)
	expect(first.queryKey).toEqual(['recipes', 'owner-a', '/backend/recipes', 'rice', 'Dinner', false, 'title', 'asc', 20])
	expect(second.queryKey).not.toEqual(first.queryKey)
	expect(recipeQueryOptions('owner-a', '/backend/recipes', { ...filters, favorites: true }).queryKey).not.toEqual(first.queryKey)
})
