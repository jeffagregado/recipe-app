'use client'

import { createContext, useContext, useSyncExternalStore } from 'react'
import { decodeWithCanvas } from '../lib/canvas-photo-decoder'
import { compressPhoto } from '../lib/compress-photo'
import { checkPickedPhoto } from '../lib/recipe-files'
import { noPhoto, pendingPhoto, pickedPhoto, type PhotoValue } from '../lib/recipe-photo'
import type { PhotoDiscarder, PhotoUploader } from '../lib/upload-pending-photo'

/** What a slot shows besides its photo: a pick being shrunk or the pick's problem, and the upload's progress or failure. */
type SlotStatus = { preparing: boolean; pickError?: string; progress: number; uploadError?: string }

const IDLE: SlotStatus = { preparing: false, progress: 0 }

/** Where the slots' photos live. A slot is `cover` or a step's key; `read` answers null once that step is gone. */
type PhotoSlotHost = {
	read: (slot: string) => PhotoValue | null
	write: (slot: string, photo: PhotoValue) => void
	/** Every slot's photo. */
	all: () => PhotoValue[]
	upload: PhotoUploader
	discard: PhotoDiscarder
}

type Upload = { file: File; controller: AbortController }

/**
 * The form's photo slots, kept by slot rather than by component, so a photo being shrunk or uploaded follows its step when
 * steps move and stops when the step is deleted. A picked file is checked and shrunk once, then uploaded at once as a Pending
 * photo. The slot holds the picked file until the upload answers with its id, and keeps it after a failure for Retry. Save
 * waits for all of this. Only a slot's latest pick and latest upload count.
 * A Pending photo the form stops using (removed, replaced, its step deleted, the form abandoned) is discarded at once; one a
 * save has used is never discarded, and a failed save keeps them all for its retry.
 */
export function createPhotoSlots(host: PhotoSlotHost) {
	// Shrinking and uploading still running; Save waits for them, so it never sends the form without a photo just picked.
	const running = new Set<Promise<unknown>>()
	const track = (work: Promise<unknown>) => {
		running.add(work)
		const done = () => { running.delete(work) }
		work.then(done, done)
	}
	const statuses = new Map<string, SlotStatus>()
	const picks = new Map<string, object>()
	const uploads = new Map<string, Upload>()
	const listeners = new Set<() => void>()

	const status = (slot: string) => statuses.get(slot) ?? IDLE
	const notify = () => { for (const listener of listeners) listener() }
	function update(slot: string, change: Partial<SlotStatus>) {
		statuses.set(slot, { ...status(slot), ...change })
		notify()
	}
	const discard = (photo: PhotoValue | null) => { if (photo?.kind === 'pending') host.discard(photo.id) }
	function stop(slot: string) {
		picks.delete(slot)
		uploads.get(slot)?.controller.abort()
		uploads.delete(slot)
		statuses.delete(slot)
	}

	/** The form went back to its opening values: every pick and upload stops. */
	function reset() {
		for (const slot of new Set([...picks.keys(), ...uploads.keys(), ...statuses.keys()])) stop(slot)
		notify()
	}

	async function prepare(slot: string, pick: object, file: File) {
		const result = await compressPhoto(file, decodeWithCanvas)
		// A newer pick, a Remove, a reset or the step's deletion since then owns the slot now.
		if (picks.get(slot) !== pick || !host.read(slot)) return
		picks.delete(slot)
		if (!result.ok) return update(slot, { preparing: false, pickError: result.message })
		update(slot, { preparing: false })
		discard(host.read(slot))
		host.write(slot, pickedPhoto(result.file))
		await send(slot, result.file)
	}

	async function send(slot: string, file: File) {
		uploads.get(slot)?.controller.abort()
		const upload = { file, controller: new AbortController() }
		uploads.set(slot, upload)
		update(slot, { uploadError: undefined, progress: 0 })
		const isCurrent = () => {
			const photo = host.read(slot)
			return uploads.get(slot) === upload && photo?.kind === 'picked' && photo.file === file
		}
		const result = await host.upload(file, { signal: upload.controller.signal, onProgress: (percent) => { if (isCurrent()) update(slot, { progress: percent }) } })
		// Stored after the slot stopped wanting it, for example just before its abort arrived.
		if (!isCurrent()) return result.status === 'uploaded' ? host.discard(result.id) : undefined
		uploads.delete(slot)
		if (result.status === 'uploaded') host.write(slot, pendingPhoto(file, result.id))
		else update(slot, { uploadError: result.message })
	}

	return {
		isPreparing: () => running.size > 0,
		async settled() {
			// A photo picked while waiting joins the set; wait for that one too.
			while (running.size > 0) await Promise.allSettled([...running])
		},
		subscribe(listener: () => void) {
			listeners.add(listener)
			return () => { listeners.delete(listener) }
		},
		status,
		/** A rejected file never replaces the slot's photo; its problem stays visible until the next pick. */
		pick(slot: string, file: File) {
			const pick = {}
			picks.set(slot, pick)
			const problem = checkPickedPhoto(file)
			update(slot, { pickError: problem ?? undefined, preparing: !problem })
			if (!problem) track(prepare(slot, pick, file))
		},
		retry(slot: string) {
			const photo = host.read(slot)
			if (photo?.kind === 'picked') track(send(slot, photo.file))
		},
		remove(slot: string) {
			stop(slot)
			notify()
			discard(host.read(slot))
			host.write(slot, noPhoto())
		},
		/** The slot's step is being deleted: its pick and upload stop, and its Pending photo is discarded. */
		release(slot: string) {
			stop(slot)
			notify()
			discard(host.read(slot))
		},
		reset,
		/** The cook is leaving the form without saving: every pick and upload stops, and every Pending photo is discarded. */
		abandon() {
			reset()
			for (const photo of host.all()) discard(photo)
		},
	}
}

export type PhotoSlots = ReturnType<typeof createPhotoSlots>

export const PhotoSlotsContext = createContext<PhotoSlots | null>(null)

export function usePhotoSlots(): PhotoSlots {
	const slots = useContext(PhotoSlotsContext)
	if (!slots) throw new Error('Photo slots are used inside a recipe form.')
	return slots
}

/** One slot's photo, as the form holds it, with what the slot shows about it and the actions it offers. */
export function usePhotoSlot(slot: string, photo: PhotoValue) {
	const slots = usePhotoSlots()
	const status = useSyncExternalStore(slots.subscribe, () => slots.status(slot), () => slots.status(slot))
	const unsent = photo.kind === 'picked'
	return {
		preparing: status.preparing,
		pickError: status.pickError,
		/** Only while the slot holds a picked file that is not yet a Pending photo. */
		uploading: unsent && !status.uploadError,
		progress: status.progress,
		uploadError: unsent ? status.uploadError : undefined,
		pick: (file: File) => slots.pick(slot, file),
		remove: () => slots.remove(slot),
		retry: () => slots.retry(slot),
	}
}

export type PhotoSlot = ReturnType<typeof usePhotoSlot>
