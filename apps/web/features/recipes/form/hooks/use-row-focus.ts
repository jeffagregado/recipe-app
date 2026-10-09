import { useEffect, useRef } from 'react'

type RowFocusRequest = { index: number; controls: string[] }

/** Moves focus into a list row after React has re-rendered it; the first enabled control in `controls` wins. */
export function useRowFocus<T extends HTMLElement>() {
	const listRef = useRef<T>(null)
	const request = useRef<RowFocusRequest | null>(null)

	useEffect(() => {
		const pending = request.current
		if (!pending) return
		request.current = null
		const row = listRef.current?.children[pending.index]
		for (const control of pending.controls) {
			const target = row?.querySelector<HTMLElement & { disabled?: boolean }>(`[data-control="${control}"]`)
			if (target && !target.disabled) {
				target.focus()
				return
			}
		}
	})

	function focusRow(next: RowFocusRequest) {
		request.current = next
	}

	return { listRef, focusRow }
}
