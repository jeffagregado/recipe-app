import { expect, it } from 'vitest'
import { compressPhoto, type DecodedPhoto } from './compress-photo'

const MIB = 1024 * 1024

type Encode = { width: number; height: number; type: string; quality: number }

/** A decoded picture of the given size whose encoder answers with `output(request)`, recording every request. */
function fakeDecoder(width: number, height: number, output: (request: Encode) => { type: string; bytes: number } = ({ type }) => ({ type, bytes: 1000 })) {
	const encodes: Encode[] = []
	let closed = 0
	const decode = async (): Promise<DecodedPhoto> => ({
		width,
		height,
		encode: async (size, type, quality) => {
			const request = { ...size, type, quality }
			encodes.push(request)
			const { type: outputType, bytes } = output(request)
			return new Blob([new Uint8Array(bytes)], { type: outputType })
		},
		close: () => { closed++ },
	})
	return { decode, encodes, closedCount: () => closed }
}

const picked = (name = 'IMG_4032.jpg') => new File(['original'], name, { type: 'image/jpeg', lastModified: 1_700_000_000_000 })

it.each([
	['landscape', 4032, 3024, 2048, 1536],
	['portrait', 3024, 4032, 1536, 2048],
	['square', 6000, 6000, 2048, 2048],
	['panorama', 12000, 1000, 2048, 171],
	['thin strip', 5000, 1, 2048, 1],
	['small, never enlarged', 1200, 800, 1200, 800],
	['exactly the limit', 2048, 1024, 2048, 1024],
])('fits a %s photo inside 2048 × 2048 keeping its aspect ratio (%i × %i → %i × %i)', async (_shape, width, height, fittedWidth, fittedHeight) => {
	const codec = fakeDecoder(width, height)
	await compressPhoto(picked(), codec.decode)
	expect(codec.encodes[0]).toMatchObject({ width: fittedWidth, height: fittedHeight })
})

it('encodes WebP at quality 0.85 and keeps the picked name with a .webp extension', async () => {
	const codec = fakeDecoder(4032, 3024)
	const result = await compressPhoto(picked('IMG_4032.jpg'), codec.decode)
	expect(codec.encodes).toEqual([{ width: 2048, height: 1536, type: 'image/webp', quality: 0.85 }])
	expect(result.ok).toBe(true)
	if (!result.ok) return
	expect(result.file.name).toBe('IMG_4032.webp')
	expect(result.file.type).toBe('image/webp')
	expect(result.file.size).toBe(1000)
	expect(result.file.lastModified).toBe(1_700_000_000_000)
	expect(codec.closedCount()).toBe(1)
})

it('steps quality down until the output is at most 4 MiB', async () => {
	const bytesAt: Record<number, number> = { 0.85: 6 * MIB, 0.75: 4 * MIB + 1, 0.65: 4 * MIB }
	const codec = fakeDecoder(4032, 3024, ({ type, quality }) => ({ type, bytes: bytesAt[quality] }))
	const result = await compressPhoto(picked(), codec.decode)
	expect(codec.encodes.map(({ type, quality }) => [type, quality])).toEqual([['image/webp', 0.85], ['image/webp', 0.75], ['image/webp', 0.65]])
	expect(result.ok && result.file.size).toBe(4 * MIB)
})

it('re-encodes as JPEG when the browser answers a WebP request with another type, and keeps JPEG while stepping down', async () => {
	// Safari's canvas cannot encode WebP and returns PNG instead.
	const codec = fakeDecoder(4032, 3024, ({ type, quality }) => (type === 'image/webp' ? { type: 'image/png', bytes: 9 * MIB } : { type, bytes: quality === 0.85 ? 5 * MIB : 3 * MIB }))
	const result = await compressPhoto(picked('IMG_4032.jpg'), codec.decode)
	expect(codec.encodes.map(({ type, quality }) => [type, quality])).toEqual([['image/webp', 0.85], ['image/jpeg', 0.85], ['image/jpeg', 0.75]])
	expect(result.ok && [result.file.name, result.file.type, result.file.size]).toEqual(['IMG_4032.jpg', 'image/jpeg', 3 * MIB])
})

it('gives up with a message once the lowest quality is still over 4 MiB', async () => {
	const codec = fakeDecoder(4032, 3024, ({ type }) => ({ type, bytes: 4 * MIB + 1 }))
	const result = await compressPhoto(picked('noisy.png'), codec.decode)
	expect(codec.encodes.map(({ quality }) => quality)).toEqual([0.85, 0.75, 0.65, 0.55, 0.45])
	expect(result).toEqual({ ok: false, message: 'noisy.png can’t be made small enough to upload. Choose a smaller photo.' })
	expect(codec.closedCount()).toBe(1)
})

it.each([
	['decoded', async () => { throw new DOMException('The source image could not be decoded.', 'InvalidStateError') }],
	['encoded', async (): Promise<DecodedPhoto> => ({ width: 10, height: 10, encode: async () => { throw new Error('Canvas failed') }, close: () => {} })],
])('reports a photo that cannot be %s as unreadable', async (_step, decode) => {
	expect(await compressPhoto(picked('broken.jpg'), decode)).toEqual({ ok: false, message: 'broken.jpg couldn’t be read as a photo. Choose another one.' })
})
