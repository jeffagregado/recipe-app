import { expect, it } from 'vitest'
import { recipeTimes, servingsLabel } from './recipe-detail-format'

it('lists prep, cook and their total, keeping zero minutes', () => {
	expect(recipeTimes({ prepTimeMinutes: 10, cookTimeMinutes: 20 })).toEqual([
		{ label: 'Prep', minutes: 10 },
		{ label: 'Cook', minutes: 20 },
		{ label: 'Total', minutes: 30 },
	])
	expect(recipeTimes({ prepTimeMinutes: 0, cookTimeMinutes: 15 })).toContainEqual({ label: 'Total', minutes: 15 })
})

it('omits missing times and the total unless both exist', () => {
	expect(recipeTimes({ prepTimeMinutes: 10, cookTimeMinutes: null })).toEqual([{ label: 'Prep', minutes: 10 }])
	expect(recipeTimes({ prepTimeMinutes: null, cookTimeMinutes: 5 })).toEqual([{ label: 'Cook', minutes: 5 }])
	expect(recipeTimes({ prepTimeMinutes: null, cookTimeMinutes: null })).toEqual([])
})

it('uses the singular for one serving', () => {
	expect(servingsLabel(1)).toBe('1 serving')
	expect(servingsLabel(2)).toBe('2 servings')
})
