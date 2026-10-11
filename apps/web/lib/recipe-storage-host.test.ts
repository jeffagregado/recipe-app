import { describe, expect, it } from 'vitest'
import { recipeStorageHost } from './recipe-storage-host'

describe('recipeStorageHost', () => {
	it.each([undefined, '', '   '])('falls back to the storage host of the dev branch when the value is %j', (value) => {
		expect(recipeStorageHost(value)).toBe('br-hidden-waterfall-b3dj0mm5.storage.c-4.ap-southeast-1.aws.neon.tech')
	})

	it.each([
		['br-gentle-paper-b351zp4o.storage.c-4.ap-southeast-1.aws.neon.tech', 'br-gentle-paper-b351zp4o.storage.c-4.ap-southeast-1.aws.neon.tech'],
		['localhost', 'localhost'],
		// URL hostnames are lower case, and the image optimizer compares them case-sensitively.
		[' Storage.Example.COM\n', 'storage.example.com'],
	])('uses the bare hostname %j', (value, host) => {
		expect(recipeStorageHost(value)).toBe(host)
	})

	it.each([
		['a scheme', 'https://storage.example.com'],
		['a path', 'storage.example.com/recipe-app-v2-bucket'],
		['a port', 'storage.example.com:443'],
		['a query', 'storage.example.com?X-Amz-Signature=abc'],
		['credentials', 'user@storage.example.com'],
		['a subdomain wildcard', '**.neon.tech'],
		['a label wildcard', 'br-*.storage.example.com'],
		['a glob set', '{a,b}.example.com'],
		['a space inside', 'storage example.com'],
		['an empty label', 'storage..example.com'],
		['a trailing dot', 'storage.example.com.'],
		['a label starting with a hyphen', '-storage.example.com'],
	])('rejects %s, naming the variable and not the value', (_, value) => {
		let message = ''
		try { recipeStorageHost(value) } catch (error) { message = error instanceof Error ? error.message : 'not an Error' }
		expect(message).toContain('RECIPE_STORAGE_HOST')
		expect(message).not.toContain(value)
	})
})
