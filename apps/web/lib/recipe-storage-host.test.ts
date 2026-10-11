import { describe, expect, it } from 'vitest'
import { recipeStorageHost } from './recipe-storage-host'

describe('recipeStorageHost', () => {
	it.each([undefined, '', '   '])('falls back to the storage host of the dev branch when the value is %j', (value) => {
		expect(recipeStorageHost(value)).toBe('br-hidden-waterfall-b3dj0mm5.storage.c-4.ap-southeast-1.aws.neon.tech')
	})

	it.each([
		['br-example-branch-00000000.storage.c-4.ap-southeast-1.aws.neon.tech', 'br-example-branch-00000000.storage.c-4.ap-southeast-1.aws.neon.tech'],
		['localhost', 'localhost'],
		// URL hostnames are lower case, and the image optimizer compares them case-sensitively.
		[' Storage.Example.COM\n', 'storage.example.com'],
	])('uses the bare hostname %j', (value, host) => {
		expect(recipeStorageHost(value)).toBe(host)
	})

	it.each([
		['a scheme', 'https://storage.example.com'],
		['a port', 'storage.example.com:443'],
		['a path', 'storage.example.com/recipe-app-v2-bucket'],
		['a wildcard', '**.neon.tech'],
		['a space inside', 'storage example.com'],
		['an empty label', 'storage..example.com'],
		['a trailing dot', 'storage.example.com.'],
		['a label starting with a hyphen', '-storage.example.com'],
	])('rejects %s, naming the variable and not the value', (_, value) => {
		expect(() => recipeStorageHost(value)).toThrow('RECIPE_STORAGE_HOST')
		expect(() => recipeStorageHost(value)).not.toThrow(value)
	})
})
