import { expect, it } from 'vitest'
import { toRecipeCard } from './recipe-card-data'

const item = (times: { prepTimeMinutes: number | null; cookTimeMinutes: number | null; servings: number | null }) => ({
	id: 'soup', title: 'Tomato Soup', categories: [], description: null, imageUrl: null, isFavorite: false,
	createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', ...times,
})

it.each([
	['both times', { prepTimeMinutes: 10, cookTimeMinutes: 15, servings: 2 }, '25 min'],
	['prep only', { prepTimeMinutes: 10, cookTimeMinutes: null, servings: 2 }, 'Prep 10 min'],
	['cook only', { prepTimeMinutes: null, cookTimeMinutes: 0, servings: 2 }, 'Cook 0 min'],
	['no times', { prepTimeMinutes: null, cookTimeMinutes: null, servings: 2 }, null],
])('labels the card time for %s', (_, times, label) => {
	expect(toRecipeCard(item(times)).timeLabel).toBe(label)
})

it.each([
	[1, '1 serving'],
	[4, '4 servings'],
	[null, null],
])('labels %s servings', (servings, label) => {
	expect(toRecipeCard(item({ prepTimeMinutes: null, cookTimeMinutes: null, servings })).servingsLabel).toBe(label)
})

it('formats the updated date in UTC', () => {
	expect(toRecipeCard(item({ prepTimeMinutes: null, cookTimeMinutes: null, servings: null })).updatedLabel).toBe('Oct 2, 2026')
})
