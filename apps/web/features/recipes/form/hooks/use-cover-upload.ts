import { useEffect, useRef, useState } from 'react'
import { noPhoto, pendingPhoto, pickedPhoto, type PhotoValue } from '../lib/recipe-photo'
import type { PhotoUploader } from '../lib/upload-pending-photo'
import { usePhotoPick } from './use-photo-pick'
import { usePhotoPreparations } from './photo-preparations'

type Upload = { file: File; controller: AbortController }

/**
 * The cover's photo: checked and shrunk when picked, then uploaded at once as a Pending photo. The slot holds the picked
 * file until the upload answers with its id; a failed upload keeps the file for Retry. Each upload is tracked with the
 * form's photo preparations, so Save waits for it. Only the latest upload counts: a newer pick, Remove or Retry aborts it.
 */
export function useCoverUpload({ cover, setCover, upload }: { cover: () => PhotoValue; setCover: (photo: PhotoValue) => void; upload: PhotoUploader }) {
	const preparations = usePhotoPreparations()
	const [progress, setProgress] = useState(0)
	const [uploadError, setUploadError] = useState<string>()
	const latest = useRef<Upload | null>(null)

	useEffect(() => () => {
		latest.current?.controller.abort()
		latest.current = null
	}, [])

	function start(file: File) {
		latest.current?.controller.abort()
		const attempt = { file, controller: new AbortController() }
		latest.current = attempt
		setUploadError(undefined)
		setProgress(0)
		preparations.track(send(attempt))
	}

	async function send(attempt: Upload) {
		const isCurrent = () => {
			const photo = cover()
			return latest.current === attempt && photo.kind === 'picked' && photo.file === attempt.file
		}
		const result = await upload(attempt.file, { signal: attempt.controller.signal, onProgress: (percent) => { if (isCurrent()) setProgress(percent) } })
		// A newer pick, a Remove or a form reset since then owns the slot now.
		if (!isCurrent()) return
		if (result.status === 'uploaded') setCover(pendingPhoto(attempt.file, result.id))
		else setUploadError(result.message)
	}

	const { pickError, preparing, pick, remove } = usePhotoPick((file) => {
		if (file) {
			setCover(pickedPhoto(file))
			start(file)
			return
		}
		latest.current?.controller.abort()
		latest.current = null
		setCover(noPhoto())
	})

	const current = cover()
	const unsent = current.kind === 'picked'
	return {
		pickError,
		preparing,
		/** Shown only while the slot holds a picked file that is not yet a Pending photo. */
		uploading: unsent && !uploadError,
		progress,
		uploadError: unsent ? uploadError : undefined,
		pick,
		remove,
		retry: () => { if (current.kind === 'picked') start(current.file) },
	}
}
