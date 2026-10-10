'use client'

import { useSyncExternalStore } from 'react'
import { useAppToast } from '@/lib/use-app-toast'
import { setFavorite } from '../actions/favorite'
import type { FavoriteResult } from '../actions/results'

const ERRORS = {
	failed: 'Couldn’t save favorite. Try again.',
	'session-expired': 'Your session has expired. Sign in again to save favorites.',
	'not-found': 'This recipe no longer exists.',
} as const

type Entry = { favorite: boolean; pending: boolean }

/**
 * The favorite state this browser tab knows about, by recipe id. Every heart and menu item for a recipe reads it, so they
 * always agree, and it outlives the page that changed it: a hidden (Activity-preserved) list or recipe page re-reads it the
 * moment it is shown again, so neither can show a stale heart after a toggle elsewhere. A reload starts from server data.
 */
const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
/** Changes the server has confirmed in this tab; a list that filters on favorites reloads when it moves. */
let saves = 0

function subscribe(listener: () => void) {
	listeners.add(listener)
	return () => { listeners.delete(listener) }
}

function write(recipeId: string, entry: Entry) {
	entries.set(recipeId, entry)
	for (const listener of listeners) listener()
}

/** `saved` is the state the server rendered; it applies until this tab changes it. */
export function useFavorite(recipeId: string, saved: boolean) {
	const toast = useAppToast()
	const entry = useSyncExternalStore(subscribe, () => entries.get(recipeId), () => undefined)

	async function toggle() {
		const current = entries.get(recipeId)
		// A second click during a save would race the first; the heart settles on the confirmed state first.
		if (current?.pending) return
		const previous = current?.favorite ?? saved
		const next = !previous
		write(recipeId, { favorite: next, pending: true })

		const result: FavoriteResult = await setFavorite(recipeId, next).catch(() => ({ ok: false, reason: 'failed' }))
		if (result.ok) {
			saves += 1
			write(recipeId, { favorite: next, pending: false })
			return
		}
		write(recipeId, { favorite: previous, pending: false })
		toast.error(ERRORS[result.reason])
	}

	return { favorite: entry?.favorite ?? saved, toggle }
}

export function useFavoriteSaves() {
	return useSyncExternalStore(subscribe, () => saves, () => 0)
}
