import { useState } from 'react'
import { checkRecipeImage } from '../_lib/recipe-files'

/** Validates a picked file; a rejected file never replaces the current photo and its problem stays visible until the next pick. */
export function usePhotoPick(onChange: (file: File | null) => void) {
	const [pickError, setPickError] = useState<string>()

	function pick(file: File) {
		const problem = checkRecipeImage(file)
		setPickError(problem ?? undefined)
		if (!problem) onChange(file)
	}

	function remove() {
		setPickError(undefined)
		onChange(null)
	}

	return { pickError, pick, remove }
}
