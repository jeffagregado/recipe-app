/** A form group: the first group is untitled (heading null) and every later group is named. Rows live under `K`. */
export type FormGroup<K extends string, T> = { heading: string | null } & { [key in K]: T[] }

export type Direction = 'up' | 'down'

const withRows = <K extends string, T>(group: FormGroup<K, T>, key: K, rows: T[]) => ({ ...group, [key]: rows }) as FormGroup<K, T>

export function rowCount<K extends string, T>(groups: FormGroup<K, T>[], key: K): number {
	return groups.reduce((total, group) => total + group[key].length, 0)
}

/** The group and row of a flat (contract) row index, or null past the end. */
export function flatRowPath<K extends string, T>(groups: FormGroup<K, T>[], key: K, index: number): { group: number; row: number } | null {
	let start = 0
	for (const [group, value] of groups.entries()) {
		if (index < start + value[key].length) return { group, row: index - start }
		start += value[key].length
	}
	return null
}

/**
 * A row moves past its neighbour, or past a heading into the next group's top or the previous group's end.
 * A move that would empty its group is not allowed: a named group needs a row to carry its heading,
 * and the untitled first group keeps the first row.
 */
export function canMoveRow<K extends string, T>(groups: FormGroup<K, T>[], key: K, group: number, row: number, direction: Direction): boolean {
	const size = groups[group][key].length
	const inside = direction === 'up' ? row > 0 : row < size - 1
	if (inside) return true
	const neighbour = direction === 'up' ? group - 1 : group + 1
	return neighbour >= 0 && neighbour < groups.length && size > 1
}

export function moveRow<K extends string, T>(groups: FormGroup<K, T>[], key: K, group: number, row: number, direction: Direction): FormGroup<K, T>[] {
	if (!canMoveRow(groups, key, group, row, direction)) return groups
	const rows = groups[group][key]
	const target = direction === 'up' ? row - 1 : row + 1
	if (target >= 0 && target < rows.length) {
		const next = [...rows]
		;[next[row], next[target]] = [next[target], next[row]]
		return groups.with(group, withRows(groups[group], key, next))
	}
	const neighbour = direction === 'up' ? group - 1 : group + 1
	const moved = rows[row]
	const others = groups[neighbour][key]
	return groups.map((value, index) => {
		if (index === group) return withRows(value, key, rows.toSpliced(row, 1))
		if (index === neighbour) return withRows(value, key, direction === 'up' ? [...others, moved] : [moved, ...others])
		return value
	})
}

/** Named groups reorder among themselves; none can move above the untitled first group. */
export function canMoveGroup(groups: readonly unknown[], group: number, direction: Direction): boolean {
	return direction === 'up' ? group > 1 : group > 0 && group < groups.length - 1
}

export function moveGroup<G>(groups: G[], group: number, direction: Direction): G[] {
	if (!canMoveGroup(groups, group, direction)) return groups
	const target = direction === 'up' ? group - 1 : group + 1
	return groups.with(group, groups[target]).with(target, groups[group])
}

export function addGroup<K extends string, T>(groups: FormGroup<K, T>[], key: K, empty: T): FormGroup<K, T>[] {
	return [...groups, { heading: '', [key]: [empty] } as FormGroup<K, T>]
}

/** Drops a named group's heading and appends its rows to the group above; no row is lost. */
export function removeHeading<K extends string, T>(groups: FormGroup<K, T>[], key: K, group: number): FormGroup<K, T>[] {
	if (group < 1) return groups
	const above = groups[group - 1]
	return groups.with(group - 1, withRows(above, key, [...above[key], ...groups[group][key]])).toSpliced(group, 1)
}

/** Removes a row; a named group goes with its last row, while the untitled first group keeps an emptied row. */
export function removeRow<K extends string, T>(groups: FormGroup<K, T>[], key: K, group: number, row: number, empty: T): FormGroup<K, T>[] {
	const rows = groups[group][key]
	if (rows.length > 1) return groups.with(group, withRows(groups[group], key, rows.toSpliced(row, 1)))
	return group === 0 ? groups.with(0, withRows(groups[0], key, [empty])) : groups.toSpliced(group, 1)
}
