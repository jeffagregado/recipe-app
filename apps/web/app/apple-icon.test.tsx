// @vitest-environment node
import { describe, expect, it } from 'vitest'
import AppleIcon from './apple-icon'

describe('AppleIcon', () => {
	it('renders the recipe-card mark as a 180x180 PNG', async () => {
		const response = AppleIcon()
		const png = Buffer.from(await response.arrayBuffer())

		expect(response.status).toBe(200)
		expect(response.headers.get('content-type')).toBe('image/png')
		expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
		// The IHDR chunk holds the width and height right after the signature, its length and its type.
		expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180])
	})
})
