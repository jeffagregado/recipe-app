import { handleCreateRecipe } from '@/features/recipes/api/save-route'

/** The form posts a new recipe here as JSON with fetch; the handler checks the origin, the session and the body before forwarding it. */
export function POST(request: Request) {
	return handleCreateRecipe(request)
}
