import { handleCreateRecipe } from '@/features/recipes/api/save-route'

/** Recipe saves carry photos, so they come here as a plain multipart request instead of through a Server Action. */
export function POST(request: Request) {
	return handleCreateRecipe(request)
}
