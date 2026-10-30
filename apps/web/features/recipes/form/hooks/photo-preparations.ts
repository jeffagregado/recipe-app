/** The photo work of one form still running: shrinking and uploading. Save waits for it, so it never sends the form without a photo just picked. */
export type PhotoPreparations = {
	track: (work: Promise<unknown>) => void
	isPreparing: () => boolean
	settled: () => Promise<void>
}

export function createPhotoPreparations(): PhotoPreparations {
	const pending = new Set<Promise<unknown>>()
	return {
		track(work) {
			pending.add(work)
			const done = () => { pending.delete(work) }
			work.then(done, done)
		},
		isPreparing: () => pending.size > 0,
		async settled() {
			// A photo picked while waiting joins the set; wait for that one too.
			while (pending.size > 0) await Promise.allSettled([...pending])
		},
	}
}
