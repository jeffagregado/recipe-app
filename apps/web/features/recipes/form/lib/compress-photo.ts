const MAX_EDGE = 2048
const WEBP = 'image/webp'
const JPEG = 'image/jpeg'
/** Each upload must stay well under Vercel's 4.5 MB request limit (ADR 0005). */
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45]

type Size = { width: number; height: number }

/** A photo decoded with its orientation applied, which can be drawn at a size and encoded. */
export type DecodedPhoto = Size & {
	encode: (size: Size, type: string, quality: number) => Promise<Blob>
	close: () => void
}

/** Decodes a picked file. Production passes the canvas decoder; tests pass a fake. */
export type PhotoDecoder = (file: File) => Promise<DecodedPhoto>

export type CompressedPhoto = { ok: true; file: File } | { ok: false; message: string }

/** Scales down to fit inside the maximum edge, never up. */
function fitInside({ width, height }: Size): Size {
	const scale = Math.min(1, MAX_EDGE / Math.max(width, height))
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const EXTENSIONS: Record<string, string> = { 'image/webp': '.webp', 'image/jpeg': '.jpg' }
const renamed = (name: string, type: string) => name.replace(/\.[^.]*$/, '') + (EXTENSIONS[type] ?? '')

/**
 * Shrinks a picked photo into the file a save sends: fitted inside 2048 × 2048, WebP (or JPEG where the browser
 * cannot encode WebP), at the highest quality step that keeps it within 4 MiB.
 */
export async function compressPhoto(file: File, decode: PhotoDecoder): Promise<CompressedPhoto> {
	try {
		const output = await encodeWithinLimit(await decode(file))
		if (!output) return { ok: false, message: `${file.name} can’t be made small enough to upload. Choose a smaller photo.` }
		return { ok: true, file: new File([output], renamed(file.name, output.type), { type: output.type, lastModified: file.lastModified }) }
	} catch {
		return { ok: false, message: `${file.name} couldn’t be read as a photo. Choose another one.` }
	}
}

/** The first encoding within the size limit, or null once every quality step is over it. */
async function encodeWithinLimit(decoded: DecodedPhoto): Promise<Blob | null> {
	try {
		const size = fitInside(decoded)
		let type = WEBP
		for (const quality of QUALITY_STEPS) {
			let blob = await decoded.encode(size, type, quality)
			// A browser that cannot encode WebP returns another type (usually PNG), judged from the output, not the browser.
			if (blob.type !== type) {
				type = JPEG
				blob = await decoded.encode(size, type, quality)
			}
			if (blob.size <= MAX_OUTPUT_BYTES) return blob
		}
		return null
	} finally {
		decoded.close()
	}
}
