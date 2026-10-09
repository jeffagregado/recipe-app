import { useRowFocus } from './use-row-focus'

type RowActionsOptions = {
	count: number
	/** `data-control` of the row's main field, which receives focus after an add or remove. */
	control: string
	move: (from: number, to: number) => void
	remove: (index: number) => void
	/** Empties the only remaining row: at least one row is always required. */
	clear: () => void
}

/** Move, remove and add-focus behaviour shared by the ingredient and step lists. */
export function useRowActions<T extends HTMLElement>({ count, control, move, remove, clear }: RowActionsOptions) {
	const { listRef, focusRow } = useRowFocus<T>()

	function focusNewRow() {
		focusRow({ index: count, controls: [control] })
	}

	function moveRow(index: number, direction: 'up' | 'down') {
		const target = direction === 'up' ? index - 1 : index + 1
		focusRow({ index: target, controls: direction === 'up' ? ['move-up', 'move-down'] : ['move-down', 'move-up'] })
		move(index, target)
	}

	function removeRow(index: number) {
		if (count === 1) {
			focusRow({ index: 0, controls: [control] })
			clear()
			return
		}
		focusRow({ index: Math.min(index, count - 2), controls: [control] })
		remove(index)
	}

	return { listRef, focusNewRow, moveRow, removeRow }
}
