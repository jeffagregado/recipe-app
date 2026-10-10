import { beforeEach, expect, it, vi } from 'vitest'

const cache = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/cache', () => cache)
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`NEXT_REDIRECT:${path}`) } }))

import { openSavedRecipe } from './open-saved-recipe'
import type { SavedNotice } from './results'

beforeEach(() => { cache.refresh.mockReset() })

it('refreshes the client and lands on the recipe page with the notice', async () => {
	await expect(openSavedRecipe('recipe/1', 'recipe-saved')).rejects.toThrow('NEXT_REDIRECT:/recipes/recipe%2F1?notice=recipe-saved')
	await expect(openSavedRecipe('r1', 'recipe-updated')).rejects.toThrow('NEXT_REDIRECT:/recipes/r1?notice=recipe-updated')
	// A revalidation makes the router drop preserved pages, so Back cannot restore a list without the saved recipe.
	expect(cache.refresh).toHaveBeenCalledTimes(2)
})

it('goes to the list, without a notice, for an id or notice it does not accept', async () => {
	await expect(openSavedRecipe('', 'recipe-saved')).rejects.toThrow('NEXT_REDIRECT:/recipes')
	await expect(openSavedRecipe('r1', 'recipe-deleted' as SavedNotice)).rejects.toThrow('NEXT_REDIRECT:/recipes')
	expect(cache.refresh).not.toHaveBeenCalled()
})
