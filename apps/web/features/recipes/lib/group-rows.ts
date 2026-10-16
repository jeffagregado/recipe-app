export type RowGroup<T> = { heading: string | null; rows: T[] }

/** Splits an ordered list into groups: a row with a heading opens a named group, a row without one continues the current group. */
export function groupRows<T extends { heading: string | null }>(rows: readonly T[]): RowGroup<T>[] {
	const groups: RowGroup<T>[] = []
	for (const row of rows) {
		const current = groups.at(-1)
		if (!current || row.heading !== null) groups.push({ heading: row.heading, rows: [row] })
		else current.rows.push(row)
	}
	return groups
}
