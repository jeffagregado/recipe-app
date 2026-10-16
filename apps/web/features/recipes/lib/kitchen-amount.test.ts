import { describe, expect, it } from 'vitest'
import { kitchenAmount } from './kitchen-amount'

describe('kitchenAmount', () => {
	it.each([
		[0.5, '½'], [0.333, '⅓'], [0.667, '⅔'], [0.25, '¼'], [0.75, '¾'],
		[0.125, '⅛'], [0.375, '⅜'], [0.625, '⅝'], [0.875, '⅞'],
		[1.25, '1¼'], [2.5, '2½'], [1.333, '1⅓'], [3, '3'], [200, '200'],
	])('shows the stored amount %s as %s', (value, text) => {
		expect(kitchenAmount(value, 'stored')).toBe(text)
	})

	it.each([
		[0.1, '0.1'], [0.34, '0.34'], [2.004, '2.004'], [1.123, '1.123'], [999999999.999, '999999999.999'],
	])('keeps a stored amount with no matching fraction as its exact decimal: %s', (value, text) => {
		expect(kitchenAmount(value, 'stored')).toBe(text)
	})

	it.each([
		[1 / 3, '⅓'], [2 / 3, '⅔'], [1.5 * 1.5, '2¼'], [0.335, '⅓'], [0.995, '1'], [2.004, '2'],
		[0.140625, '0.14'], [0.03, '0.03'], [98999999999.9, '98999999999.9'],
	])('shows the scaled amount %s as %s, near fractions snapping and others rounded to two decimals', (value, text) => {
		expect(kitchenAmount(value, 'scaled')).toBe(text)
	})
})
