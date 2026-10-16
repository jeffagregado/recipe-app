import { describe, expect, it } from 'vitest'
import { groupRows } from './group-rows'

const row = (name: string, heading: string | null = null) => ({ name, heading })

describe('groupRows', () => {
	it('keeps rows without headings in one untitled group', () => {
		expect(groupRows([row('a'), row('b')])).toEqual([{ heading: null, rows: [row('a'), row('b')] }])
	})

	it('opens a named group at every row with a heading and keeps the order', () => {
		expect(groupRows([row('a'), row('b', 'Sauce'), row('c'), row('d', 'Topping')])).toEqual([
			{ heading: null, rows: [row('a')] },
			{ heading: 'Sauce', rows: [row('b', 'Sauce'), row('c')] },
			{ heading: 'Topping', rows: [row('d', 'Topping')] },
		])
	})

	it('starts with the named group when the first row has a heading, and returns no groups for no rows', () => {
		expect(groupRows([row('a', 'Dough'), row('b')])).toEqual([{ heading: 'Dough', rows: [row('a', 'Dough'), row('b')] }])
		expect(groupRows([])).toEqual([])
	})
})
