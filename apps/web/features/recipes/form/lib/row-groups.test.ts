import { describe, expect, it } from 'vitest'
import { addGroup, canMoveGroup, canMoveRow, flatRowPath, moveGroup, moveRow, removeHeading, removeRow, rowCount } from './row-groups'

type Groups = Array<{ heading: string | null; rows: string[] }>
const groups = (): Groups => [
	{ heading: null, rows: ['a', 'b'] },
	{ heading: 'Sauce', rows: ['c'] },
	{ heading: 'Topping', rows: ['d', 'e'] },
]

describe('moving rows', () => {
	it('swaps a row with its neighbour inside a group', () => {
		expect(moveRow(groups(), 'rows', 0, 0, 'down')).toEqual([{ heading: null, rows: ['b', 'a'] }, groups()[1], groups()[2]])
		expect(moveRow(groups(), 'rows', 2, 1, 'up')).toEqual([groups()[0], groups()[1], { heading: 'Topping', rows: ['e', 'd'] }])
	})

	it('crosses a heading: the last row moves to the top of the next group and the first row to the end of the one above', () => {
		expect(moveRow(groups(), 'rows', 0, 1, 'down')).toEqual([
			{ heading: null, rows: ['a'] }, { heading: 'Sauce', rows: ['b', 'c'] }, groups()[2],
		])
		expect(moveRow(groups(), 'rows', 2, 0, 'up')).toEqual([
			groups()[0], { heading: 'Sauce', rows: ['c', 'd'] }, { heading: 'Topping', rows: ['e'] },
		])
	})

	it.each([
		[0, 0, 'up', false], [2, 1, 'down', false],
		[1, 0, 'up', false], [1, 0, 'down', false],
		[0, 1, 'down', true], [2, 0, 'up', true], [0, 0, 'down', true],
	] as const)('allows moving group %i row %i %s: %s', (group, index, direction, allowed) => {
		expect(canMoveRow(groups(), 'rows', group, index, direction)).toBe(allowed)
	})

	it('never empties the untitled first group, so the first row never opens a named group', () => {
		const single: Groups = [{ heading: null, rows: ['a'] }, { heading: 'Sauce', rows: ['b', 'c'] }]
		expect(canMoveRow(single, 'rows', 0, 0, 'down')).toBe(false)
		expect(canMoveRow(single, 'rows', 1, 0, 'up')).toBe(true)
	})
})

describe('moving groups', () => {
	it('swaps a named group with the named group beside it', () => {
		expect(moveGroup(groups(), 1, 'down')).toEqual([groups()[0], groups()[2], groups()[1]])
		expect(moveGroup(groups(), 2, 'up')).toEqual([groups()[0], groups()[2], groups()[1]])
	})

	it.each([[1, 'up', false], [1, 'down', true], [2, 'up', true], [2, 'down', false]] as const)(
		'allows moving group %i %s: %s, never above the untitled first group',
		(group, direction, allowed) => expect(canMoveGroup(groups(), group, direction)).toBe(allowed),
	)
})

describe('adding and removing', () => {
	it('adds a named group with a blank heading and one empty row at the bottom', () => {
		expect(addGroup(groups(), 'rows', '')).toEqual([...groups(), { heading: '', rows: [''] }])
	})

	it('merges a removed heading’s rows into the group above, keeping every row', () => {
		expect(removeHeading(groups(), 'rows', 2)).toEqual([groups()[0], { heading: 'Sauce', rows: ['c', 'd', 'e'] }])
		expect(removeHeading(groups(), 'rows', 1)).toEqual([{ heading: null, rows: ['a', 'b', 'c'] }, groups()[2]])
	})

	it('removes a row, and a named group with its last row', () => {
		expect(removeRow(groups(), 'rows', 2, 0, '')).toEqual([groups()[0], groups()[1], { heading: 'Topping', rows: ['e'] }])
		expect(removeRow(groups(), 'rows', 1, 0, '')).toEqual([groups()[0], groups()[2]])
	})

	it('empties the last row of the untitled first group instead of removing it', () => {
		const single: Groups = [{ heading: null, rows: ['a'] }, { heading: 'Sauce', rows: ['b'] }]
		expect(removeRow(single, 'rows', 0, 0, '')).toEqual([{ heading: null, rows: [''] }, single[1]])
	})
})

describe('flat positions', () => {
	it('counts rows across groups and finds the group and row of a flat index', () => {
		expect(rowCount(groups(), 'rows')).toBe(5)
		expect([0, 1, 2, 3, 4, 5].map((index) => flatRowPath(groups(), 'rows', index))).toEqual([
			{ group: 0, row: 0 }, { group: 0, row: 1 }, { group: 1, row: 0 }, { group: 2, row: 0 }, { group: 2, row: 1 }, null,
		])
	})
})
