import { handlePhotoDelete } from '@/features/recipes/api/pending-photo-route'

/** The form deletes a Pending photo the cook removed, replaced or abandoned, so unused photos do not pile up in storage. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
	return handlePhotoDelete(request, (await params).id)
}
