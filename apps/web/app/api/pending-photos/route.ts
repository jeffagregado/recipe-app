import { handlePhotoUpload } from '@/features/recipes/api/pending-photo-route'

/** A picked photo uploads on its own as a Pending photo, so no request carries more than one photo (ADR 0005). */
export function POST(request: Request) {
	return handlePhotoUpload(request)
}
