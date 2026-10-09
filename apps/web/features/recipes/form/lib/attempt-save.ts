import { navigationError } from '@/features/recipes/lib/navigation-error'
import type { SaveRecipeResult } from './save-recipe-result'

/**
 * Runs the save action. A confirmed save redirects, which surfaces as a navigation error that React and Next must receive,
 * so it is handed back instead of being treated as a failure. Any other throw means the outcome is unknown.
 */
export async function attemptSave(
	onSave: (formData: FormData) => Promise<SaveRecipeResult>,
	payload: FormData,
	unknownMessage: string,
): Promise<{ result: SaveRecipeResult } | { navigation: unknown }> {
	try {
		return { result: await onSave(payload) }
	} catch (error) {
		const navigation = navigationError(error)
		return navigation ? { navigation } : { result: { status: 'unknown', message: unknownMessage } }
	}
}
