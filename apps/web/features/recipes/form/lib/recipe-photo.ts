import { formatFileSize } from './recipe-files'

/**
 * One photo slot (the cover, or a step's photo) in the form:
 * - `none`: nothing is attached.
 * - `existing`: the photo already stored for the recipe; shown through its signed URL and never uploaded again.
 * - `new`: a file picked in this session, uploaded on save (step photos).
 * - `picked`: a file picked in this session that is not yet a Pending photo: still uploading, or its upload failed (the cover).
 * - `pending`: a file picked in this session and uploaded as the Pending photo `id`; a save names that id (the cover).
 * The kind, not the file, tells "keep", "replace" and "remove" apart, so the form's dirty tracking notices image-only changes.
 */
export type PhotoValue =
	| { kind: 'none' }
	| { kind: 'existing'; url: string }
	| { kind: 'new'; file: File }
	| { kind: 'picked'; file: File }
	| { kind: 'pending'; file: File; id: string }

export type FilledPhoto = Exclude<PhotoValue, { kind: 'none' }>

export const noPhoto = (): PhotoValue => ({ kind: 'none' })
export const existingPhoto = (url: string | null): PhotoValue => (url ? { kind: 'existing', url } : noPhoto())
export const newPhoto = (file: File): PhotoValue => ({ kind: 'new', file })
export const pickedPhoto = (file: File): PhotoValue => ({ kind: 'picked', file })
export const pendingPhoto = (file: File, id: string): PhotoValue => ({ kind: 'pending', file, id })

export function isPhotoValue(value: unknown): value is PhotoValue {
	if (typeof value !== 'object' || value === null) return false
	const photo = value as { kind?: unknown; url?: unknown; file?: unknown; id?: unknown }
	if (photo.kind === 'none') return true
	if (photo.kind === 'existing') return typeof photo.url === 'string'
	if (photo.kind === 'pending') return photo.file instanceof File && typeof photo.id === 'string'
	return (photo.kind === 'new' || photo.kind === 'picked') && photo.file instanceof File
}

/** What the user is told about the photo: the picked file, or that it is the one already saved. */
export function photoCaption(photo: FilledPhoto): string {
	return 'file' in photo ? `${photo.file.name} · ${formatFileSize(photo.file.size)}` : 'Current photo'
}

/** The file a save must upload for this slot, if any. */
export const photoUpload = (photo: PhotoValue): File | null => (photo.kind === 'new' ? photo.file : null)
