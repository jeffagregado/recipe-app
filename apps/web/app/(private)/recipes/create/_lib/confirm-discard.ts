/** Single seam for the "discard unsaved changes?" question so a dialog can replace window.confirm later. */
export function confirmDiscardChanges(): boolean {
	return window.confirm('Discard this recipe? Your changes will be lost.')
}
