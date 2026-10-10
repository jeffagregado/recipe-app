import { handleUpdateRecipe } from '@/features/recipes/api/save-route'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
	return handleUpdateRecipe(request, (await params).id)
}
