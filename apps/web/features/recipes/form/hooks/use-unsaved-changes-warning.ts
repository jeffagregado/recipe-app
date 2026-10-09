import { useEffect } from 'react'

/** Asks the browser to confirm closing or reloading the page while there are unsaved changes. */
export function useUnsavedChangesWarning(isDirty: boolean) {
	useEffect(() => {
		if (!isDirty) return
		const warn = (event: BeforeUnloadEvent) => event.preventDefault()
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [isDirty])
}
