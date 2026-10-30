import { useEffect, useRef, useState } from 'react'
import { decodeWithCanvas } from '../lib/canvas-photo-decoder'
import { compressPhoto } from '../lib/compress-photo'
import { checkPickedPhoto } from '../lib/recipe-files'
import { usePhotoPreparations } from './photo-preparations'

/**
 * Checks and shrinks a picked file once, when it is picked, so every save attempt sends the same file.
 * A rejected file never replaces the current photo and its problem stays visible until the next pick.
 * Only the latest pick counts: a newer pick or a Remove supersedes one still being prepared.
 */
export function usePhotoPick(onChange: (file: File | null) => void) {
	const [pickError, setPickError] = useState<string>()
	const [preparing, setPreparing] = useState(false)
	const preparations = usePhotoPreparations()
	const latestPick = useRef(0)
	const mounted = useRef(false)

	useEffect(() => {
		mounted.current = true
		return () => { mounted.current = false }
	}, [])

	function pick(file: File) {
		const pickId = ++latestPick.current
		const problem = checkPickedPhoto(file)
		setPickError(problem ?? undefined)
		setPreparing(!problem)
		// Tracked until the photo is in the form, so a Save pressed meanwhile sends it.
		if (!problem) void preparations.track(prepare(pickId, file))
	}

	async function prepare(pickId: number, file: File) {
		const result = await compressPhoto(file, decodeWithCanvas)
		// A step removed or moved while its photo was prepared is a different slot now; drop the result.
		if (!mounted.current || pickId !== latestPick.current) return
		setPreparing(false)
		if (result.ok) onChange(result.file)
		else setPickError(result.message)
	}

	function remove() {
		latestPick.current++
		setPreparing(false)
		setPickError(undefined)
		onChange(null)
	}

	return { pickError, preparing, pick, remove }
}
