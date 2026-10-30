import { RECIPE_LIMITS } from '@recipe-app/contracts/types'
import { expect, it } from 'vitest'
import { checkPickedPhoto, checkRecipeImage, formatFileSize } from './recipe-files'

const MIB = 1024 * 1024

function fileOf(name: string, type: string, size: number) {
	const file = new File(['x'], name, { type })
	Object.defineProperty(file, 'size', { value: size })
	return file
}

it.each([
	['a picked original', checkPickedPhoto, 25 * MIB],
	['the compressed photo a save sends', checkRecipeImage, RECIPE_LIMITS.imageBytes],
])('accepts JPEG, PNG and WebP images up to the limit for %s', (_file, check, limit) => {
	for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
		expect(check(fileOf('photo', type, limit))).toBeNull()
	}
})

it.each([
	[checkPickedPhoto, 'IMG_4032.jpg', 30 * MIB, 'IMG_4032.jpg is 30.0 MB. The limit is 25 MB.'],
	[checkPickedPhoto, 'edge.png', 25 * MIB + 1, 'edge.png is 25.1 MB. The limit is 25 MB.'],
	[checkRecipeImage, 'bacon-closeup.webp', 7.8 * MIB, 'bacon-closeup.webp is 7.8 MB. The limit is 4 MB.'],
	[checkRecipeImage, 'edge.webp', RECIPE_LIMITS.imageBytes + 1, 'edge.webp is 4.1 MB. The limit is 4 MB.'],
])('names the file and the limit when it is too large (%#)', (check, name, size, message) => {
	expect(check(fileOf(name, 'image/jpeg', size))).toBe(message)
})

it.each([checkPickedPhoto, checkRecipeImage])('rejects empty files and unsupported types such as SVG, GIF and video (%#)', (check) => {
	expect(check(fileOf('empty.jpg', 'image/jpeg', 0))).toBe('empty.jpg is empty.')
	for (const [name, type] of [['logo.svg', 'image/svg+xml'], ['anim.gif', 'image/gif'], ['clip.mp4', 'video/mp4'], ['notes.txt', '']]) {
		expect(check(fileOf(name, type, 10))).toBe(`${name} is not a JPG, PNG or WebP image.`)
	}
})

it('formats sizes for display', () => {
	expect(formatFileSize(512)).toBe('1 KB')
	expect(formatFileSize(1.8 * 1024 * 1024)).toBe('1.8 MB')
})
