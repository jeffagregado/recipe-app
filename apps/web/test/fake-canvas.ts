import { vi } from 'vitest'

/**
 * jsdom cannot decode images or encode a canvas. This stands in for `createImageBitmap` and the canvas element's
 * `getContext` and `toBlob`, so a picked photo goes through the real compression code: every image decodes as
 * 4032 × 3024 and encodes to a 7-byte blob of the requested type. Files whose names are listed as unreadable fail to
 * decode. `hold()` keeps encodes waiting until the returned function is called, to observe the form meanwhile.
 * Undo with `vi.unstubAllGlobals()` and `vi.restoreAllMocks()`.
 */
export function installFakeCanvas({ unreadable = [] as string[] } = {}) {
	let encodes = 0
	let gate: Promise<void> = Promise.resolve()

	vi.stubGlobal('createImageBitmap', async (file: File) => {
		if (unreadable.includes(file.name)) throw new DOMException('The source image could not be decoded.', 'InvalidStateError')
		return { width: 4032, height: 3024, close: () => {} }
	})
	const context = { fillRect: () => {}, drawImage: () => {} } as unknown as CanvasRenderingContext2D
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
	vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
		encodes++
		void gate.then(() => callback(new Blob(['encoded'], { type })))
	})

	return {
		encodeCount: () => encodes,
		hold: () => {
			let release!: () => void
			gate = new Promise((resolve) => { release = resolve })
			return () => release()
		},
	}
}
