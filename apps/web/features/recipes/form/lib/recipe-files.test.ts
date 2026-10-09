import { RECIPE_LIMITS } from '@recipe-app/contracts/types'
import { expect, it } from 'vitest'
import { checkRecipeImage, formatFileSize } from './recipe-files'

function fileOf(name: string, type: string, size: number) {
	const file = new File(['x'], name, { type })
	Object.defineProperty(file, 'size', { value: size })
	return file
}

it('accepts JPEG, PNG and WebP images up to the shared limit', () => {
	for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
		expect(checkRecipeImage(fileOf('photo', type, RECIPE_LIMITS.imageBytes))).toBeNull()
	}
})

it('names the file and the limit when it is too large', () => {
	expect(checkRecipeImage(fileOf('bacon-closeup.jpg', 'image/jpeg', 7.8 * 1024 * 1024))).toBe('bacon-closeup.jpg is 7.8 MB. The limit is 5 MB.')
	expect(checkRecipeImage(fileOf('edge.png', 'image/png', RECIPE_LIMITS.imageBytes + 1))).toBe('edge.png is 5.1 MB. The limit is 5 MB.')
})

it('rejects empty files and unsupported types such as SVG, GIF and video', () => {
	expect(checkRecipeImage(fileOf('empty.jpg', 'image/jpeg', 0))).toBe('empty.jpg is empty.')
	for (const [name, type] of [['logo.svg', 'image/svg+xml'], ['anim.gif', 'image/gif'], ['clip.mp4', 'video/mp4'], ['notes.txt', '']]) {
		expect(checkRecipeImage(fileOf(name, type, 10))).toBe(`${name} is not a JPG, PNG or WebP image.`)
	}
})

it('formats sizes for display', () => {
	expect(formatFileSize(512)).toBe('1 KB')
	expect(formatFileSize(1.8 * 1024 * 1024)).toBe('1.8 MB')
})
