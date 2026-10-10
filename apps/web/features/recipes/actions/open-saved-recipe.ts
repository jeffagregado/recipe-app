'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { isValidRecipeId } from '@/features/recipes/lib/recipe-id'
import { withNotice } from '@/lib/notice'
import type { SavedNotice } from './results'

/**
 * Runs after the save endpoint has confirmed a save. The list and detail are read per request (no cache tag to update),
 * but a revalidation makes the router drop preserved pages, so Back or Forward re-reads the list and the recipe.
 * It changes nothing itself: it only lands on the recipe page with the notice.
 */
export async function openSavedRecipe(recipeId: string, notice: SavedNotice): Promise<void> {
	if (!isValidRecipeId(recipeId) || (notice !== 'recipe-saved' && notice !== 'recipe-updated')) redirect('/recipes')
	refresh()
	redirect(withNotice(`/recipes/${encodeURIComponent(recipeId)}`, notice))
}
