import { useEffect } from 'react'

/**
 * Raises the mobile toast viewport's top edge (`--toast-top` on the root, default: the app header plus 16px) while the
 * caller is mounted, so a page with its own sticky header can keep toasts below it. Restores the previous value on unmount.
 */
export function useToastTop(value: string) {
	useEffect(() => {
		const root = document.documentElement
		const previous = root.style.getPropertyValue('--toast-top')
		root.style.setProperty('--toast-top', value)
		return () => {
			if (previous) root.style.setProperty('--toast-top', previous)
			else root.style.removeProperty('--toast-top')
		}
	}, [value])
}
