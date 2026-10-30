import type { DecodedPhoto } from './compress-photo'

/**
 * Decodes with the browser's own image APIs, applying EXIF orientation, and encodes through a canvas element
 * (OffscreenCanvas is missing from some WebKit builds).
 */
export async function decodeWithCanvas(file: File): Promise<DecodedPhoto> {
	const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
	return {
		width: bitmap.width,
		height: bitmap.height,
		encode({ width, height }, type, quality) {
			const canvas = document.createElement('canvas')
			canvas.width = width
			canvas.height = height
			const context = canvas.getContext('2d')
			if (!context) return Promise.reject(new Error('A 2D canvas is not available.'))
			// JPEG has no transparency; white is also what the API flattens transparent photos onto (ADR 0002).
			context.fillStyle = '#fff'
			context.fillRect(0, 0, width, height)
			context.imageSmoothingQuality = 'high'
			context.drawImage(bitmap, 0, 0, width, height)
			return new Promise((resolve, reject) => {
				canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The canvas could not be encoded.'))), type, quality)
			})
		},
		close: () => bitmap.close(),
	}
}
