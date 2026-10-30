import { photoUploadResultSchema, UPLOAD_MESSAGES, type PhotoUploadResult } from './photo-upload-result'

/** Uploads one prepared photo as a Pending photo, reporting progress as a whole percentage. Never rejects. */
export type PhotoUploader = (file: File, options: { onProgress: (percent: number) => void; signal: AbortSignal }) => Promise<PhotoUploadResult>

/** The API runs two uploads per Account at a time and refuses a third, so a form never sends more. */
const UPLOADS_AT_ONCE = 2

/** Lets `upload` run at most two at a time; the others wait in pick order. A photo stopped while waiting is never sent. */
export function limitUploads(upload: PhotoUploader): PhotoUploader {
	let running = 0
	const waiting: (() => void)[] = []
	return async (file, options) => {
		while (running >= UPLOADS_AT_ONCE) await new Promise<void>((resolve) => { waiting.push(resolve) })
		if (options.signal.aborted) {
			waiting.shift()?.()
			return { status: 'failed', message: UPLOAD_MESSAGES.failed }
		}
		running++
		try { return await upload(file, options) } finally {
			running--
			waiting.shift()?.()
		}
	}
}

/** Discards a Pending photo the form no longer uses. Sent without waiting for the answer, and never rejects. */
export type PhotoDiscarder = (id: string) => void

/** `keepalive`, so the request survives the page closing or reloading. Best effort: a Pending photo it misses expires. */
export const discardPendingPhoto: PhotoDiscarder = (id) => {
	fetch(`/api/pending-photos/${encodeURIComponent(id)}`, { method: 'DELETE', keepalive: true, credentials: 'same-origin' }).catch(() => {})
}

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
