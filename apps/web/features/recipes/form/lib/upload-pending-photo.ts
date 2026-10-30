import { photoUploadResultSchema, UPLOAD_MESSAGES, type PhotoUploadResult } from './photo-upload-result'

/** Uploads one prepared photo as a Pending photo, reporting progress as a whole percentage. Never rejects. */
export type PhotoUploader = (file: File, options: { onProgress: (percent: number) => void; signal: AbortSignal }) => Promise<PhotoUploadResult>

/** XMLHttpRequest rather than fetch: only it reports upload progress. The browser only ever talks to this site's origin. */
export const uploadPendingPhoto: PhotoUploader = (file, { onProgress, signal }) => new Promise((resolve) => {
	const failed: PhotoUploadResult = { status: 'failed', message: UPLOAD_MESSAGES.failed }
	const request = new XMLHttpRequest()
	request.open('POST', '/api/pending-photos')
	request.responseType = 'json'
	request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)) }
	// Only a body the upload route could have written is trusted.
	request.onload = () => resolve(photoUploadResultSchema.safeParse(request.response).data ?? failed)
	request.onerror = () => resolve(failed)
	request.onabort = () => resolve(failed)
	signal.addEventListener('abort', () => request.abort(), { once: true })
	const body = new FormData()
	body.append('photo', file, file.name)
	request.send(body)
})
