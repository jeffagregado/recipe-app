import { describe, expect, it } from 'vitest'
import { clampServings, MAX_SERVINGS, MIN_SERVINGS, scaledAmount } from './scale-quantity'

describe('scaledAmount', () => {
	it('keeps the stored amount exactly at the original servings, including three decimals', () => {
		expect(scaledAmount(1.125, 'cup', 4, 4)).toBe('1.125 cup')
		expect(scaledAmount(200, 'g', 2, 2)).toBe('200 g')
	})

	it('scales amounts with the servings ratio', () => {
		expect(scaledAmount(100, 'g', 2, 3)).toBe('150 g')
		expect(scaledAmount(1, 'tbsp', 2, 3)).toBe('1.5 tbsp')
		expect(scaledAmount(300, 'g', 3, 2)).toBe('200 g')
	})

	it('rounds to at most two decimals and drops trailing zeros', () => {
		expect(scaledAmount(1, 'cup', 3, 1)).toBe('0.33 cup')
		expect(scaledAmount(2, 'cup', 3, 1)).toBe('0.67 cup')
		expect(scaledAmount(1.5, 'tsp', 2, 4)).toBe('3 tsp')
		expect(scaledAmount(0.5, 'tsp', 2, 3)).toBe('0.75 tsp')
		expect(scaledAmount(0.1, 'tsp', 3, 1)).toBe('0.03 tsp')
	})

	it('handles large values without grouping separators', () => {
		expect(scaledAmount(999_999_999.999, 'g', 1, 99)).toBe('98999999999.9 g')
		expect(scaledAmount(1_000_000, 'g', 1, 2)).toBe('2000000 g')
	})

	it('returns to the exact original values after scaling back', () => {
		expect(scaledAmount(0.375, 'cup', 8, 3)).toBe('0.14 cup')
		expect(scaledAmount(0.375, 'cup', 8, 8)).toBe('0.375 cup')
	})

	it.each([
		[null, 'g'],
		[2, null],
		[null, null],
	] as const)('shows "to taste" and never changes it for quantity %s and unit %s', (quantity, unit) => {
		expect(scaledAmount(quantity, unit, 2, 2)).toBe('to taste')
		expect(scaledAmount(quantity, unit, 2, 7)).toBe('to taste')
	})
})

describe('clampServings', () => {
	it('keeps servings within 1 to 99', () => {
		expect([MIN_SERVINGS, MAX_SERVINGS]).toEqual([1, 99])
		expect(clampServings(0, 2)).toBe(1)
		expect(clampServings(100, 2)).toBe(99)
		expect(clampServings(5, 2)).toBe(5)
	})

	it('allows a stored serving count above 99 to be the ceiling', () => {
		expect(clampServings(500, 150)).toBe(150)
		expect(clampServings(120, 150)).toBe(120)
	})
})
