import { expect, it } from 'vitest'
import { displayNameLength, isDisplayNameChanged } from './display-name-form'

it.each([
	['Ana María', 9],
	['  Ana María  ', 9],
	['   ', 0],
	['a'.repeat(101), 101],
])('counts %j as %i characters, the way the shared rule counts after trimming', (value, length) => {
	expect(displayNameLength(value)).toBe(length)
})

it.each([
	['Ana María', false],
	['  Ana María ', false],
	['Ana Maria', true],
	['ana maría', true],
	['', true],
])('with “Ana María” saved, %j is a change: %s', (value, changed) => {
	expect(isDisplayNameChanged(value, 'Ana María')).toBe(changed)
})
