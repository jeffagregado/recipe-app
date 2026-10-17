import { useEffect, useRef } from 'react'
import { useFieldArray, useFormContext, useFormState, type ArrayPath } from 'react-hook-form'
import type { RecipeFormValues } from '../lib/recipe-form-schema'
import * as groupsLib from '../lib/row-groups'
import type { Direction, FormGroup } from '../lib/row-groups'

type RowGroupsOptions<K extends string, T> = {
	name: ArrayPath<RecipeFormValues> & ('ingredients' | 'instructions')
	/** Where a group keeps its rows: `rows` for ingredients, `steps` for instructions. */
	key: K
	empty: () => T
	/** `data-control` of a row's main field, which receives focus after an add or remove. */
	control: string
}

/** Row selector by flat (whole-list) position, which is also the row's visible number minus one. */
const rowSelector = (index: number, controls: string[]) => controls.map((control) => `[data-row="${index}"] [data-control="${control}"]`)
const groupSelector = (group: number, controls: string[]) => controls.map((control) => `[data-group="${group}"] [data-control="${control}"]`)

/**
 * Add, move and remove for rows kept in groups. Every change goes through one pure step from `row-groups`
 * and one `replace`, so rows can cross groups; focus moves once React has rendered the result.
 */
export function useRowGroups<K extends string, T>({ name, key, empty, control }: RowGroupsOptions<K, T>) {
	const { control: formControl, getValues, trigger } = useFormContext<RecipeFormValues>()
	const { isSubmitted } = useFormState({ control: formControl })
	const { fields, replace } = useFieldArray({ control: formControl, name })
	const containerRef = useRef<HTMLDivElement>(null)
	const focusRequest = useRef<string[] | null>(null)
	const groups = fields as unknown as Array<FormGroup<K, T> & { id: string }>

	useEffect(() => {
		const selectors = focusRequest.current
		if (!selectors) return
		focusRequest.current = null
		for (const selector of selectors) {
			const target = containerRef.current?.querySelector<HTMLElement & { disabled?: boolean }>(selector)
			if (target && !target.disabled) {
				target.focus()
				return
			}
		}
	})

	const current = () => getValues(name) as unknown as FormGroup<K, T>[]
	const startOf = (all: FormGroup<K, T>[], group: number) => all.slice(0, group).reduce((total, value) => total + value[key].length, 0)

	function apply(next: FormGroup<K, T>[], focus: string[]) {
		focusRequest.current = focus
		replace(next as never)
		// `replace` keeps errors by position; once the form was submitted, recheck so they follow their fields.
		if (isSubmitted) void trigger(name)
	}

	const total = groupsLib.rowCount(groups, key)

	return {
		containerRef,
		groups,
		total,
		startOf: (group: number) => startOf(groups, group),
		canMoveRow: (group: number, row: number, direction: Direction) => groupsLib.canMoveRow(groups, key, group, row, direction),
		canMoveGroup: (group: number, direction: Direction) => groupsLib.canMoveGroup(groups, group, direction),
		addRow(group: number) {
			const all = current()
			const index = startOf(all, group) + all[group][key].length
			apply(all.with(group, { ...all[group], [key]: [...all[group][key], empty()] }), rowSelector(index, [control]))
		},
		addGroup() {
			const all = current()
			apply(groupsLib.addGroup(all, key, empty()), [`[data-group-heading="${all.length}"]`])
		},
		moveRow(group: number, row: number, direction: Direction) {
			const all = current()
			const index = startOf(all, group) + row
			const inside = direction === 'up' ? row > 0 : row < all[group][key].length - 1
			// Crossing a heading keeps the row's place in the whole list; moving inside a group swaps it with its neighbour.
			const target = inside ? index + (direction === 'up' ? -1 : 1) : index
			apply(groupsLib.moveRow(all, key, group, row, direction), rowSelector(target, direction === 'up' ? ['move-up', 'move-down'] : ['move-down', 'move-up']))
		},
		removeRow(group: number, row: number) {
			const all = current()
			const index = startOf(all, group) + row
			const next = groupsLib.removeRow(all, key, group, row, empty())
			apply(next, rowSelector(Math.min(index, groupsLib.rowCount(next, key) - 1), [control]))
		},
		moveGroup(group: number, direction: Direction) {
			const target = direction === 'up' ? group - 1 : group + 1
			apply(groupsLib.moveGroup(current(), group, direction), groupSelector(target, direction === 'up' ? ['group-up', 'group-down'] : ['group-down', 'group-up']))
		},
		nameFirstGroup() {
			apply(groupsLib.nameFirstGroup(current()), ['[data-group-heading="0"]'])
		},
		removeHeading(group: number) {
			const all = current()
			// The first group's "Add heading" link comes back only while a later group exists; otherwise focus its first row.
			const focus = group === 0 ? [...groupSelector(0, ['add-heading']), ...rowSelector(0, [control])] : rowSelector(startOf(all, group), [control])
			apply(groupsLib.removeHeading(all, key, group), focus)
		},
	}
}
