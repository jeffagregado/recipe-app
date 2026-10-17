import { expect, it } from 'vitest'
import { parseDemoMode } from './demo-mode'

it.each([
	[undefined, false],
	['', false],
	['  ', false],
	['false', false],
	['true', true],
])('reads DEMO_MODE %j as %s', (value, expected) => {
	expect(parseDemoMode(value)).toBe(expected)
})

it.each(['TRUE', '1', 'yes', 'on'])('refuses DEMO_MODE %j, so a typo cannot build the demo as the main site', (value) => {
	expect(() => parseDemoMode(value)).toThrow('DEMO_MODE must be true, false or empty.')
})
