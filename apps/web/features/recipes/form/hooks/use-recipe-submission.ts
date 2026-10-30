'use client'

import { useLayoutEffect, useRef, useState, useTransition, type BaseSyntheticEvent } from 'react'
import type { FieldPath, UseFormReturn } from 'react-hook-form'
import { useAppToast } from '@/lib/use-app-toast'
import { attemptSave } from '../lib/attempt-save'
import { mapSaveFieldErrors } from '../lib/map-save-errors'
import type { RecipeFormValues } from '../lib/recipe-form-schema'
import { prepareRecipePayload, type RecipeFormMode, type RecipeSaveBody } from '../lib/recipe-payload'
import type { PhotoSlots } from './photo-slots'
import { SAVE_MESSAGES, toastMessage, UPDATE_MESSAGES, type SaveMessages, type SaveRecipeResult } from '../lib/save-recipe-result'

export type SaveRecipeAction = (body: RecipeSaveBody) => Promise<SaveRecipeResult>
export type FormAlert = { status: SaveRecipeResult['status']; message: string; details: string[] }

type UseRecipeSubmissionOptions = { form: UseFormReturn<RecipeFormValues>; mode: RecipeFormMode; onSave: SaveRecipeAction; photos: Pick<PhotoSlots, 'isPreparing' | 'settled' | 'reset'> }

/** Saving: one submission key per attempt, the in-flight guard, the outcome alert and toast, and the reset once the user has left. */
export function useRecipeSubmission({ form, mode, onSave, photos }: UseRecipeSubmissionOptions) {
	const messages: SaveMessages = mode === 'edit' ? UPDATE_MESSAGES : SAVE_MESSAGES
	const toast = useAppToast()
	const [pending, startTransition] = useTransition()
	// The redirect after a confirmed save ends the transition slightly before the new page appears; stay disabled until then.
	const [leaving, setLeaving] = useState(false)
	// Save pressed while a picked photo is still being shrunk or uploaded waits for it behind the same saving state.
	const [waitingForPhotos, setWaitingForPhotos] = useState(false)
	const [alert, setAlert] = useState<FormAlert>()
	const [focusRequest, setFocusRequest] = useState(0)
	// One submission key per attempt: reused only for the same payload after an unknown outcome.
	const attempt = useRef<{ key: string; fingerprint: string } | null>(null)
	const inFlight = useRef(false)
	// Set once the user is leaving for good (a confirmed save, or a confirmed discard).
	const resetOnHide = useRef(false)

	// Cache Components keeps hidden pages mounted; start the next visit from the opening values once the user has left for good.
	useLayoutEffect(() => () => {
		if (!resetOnHide.current) return
		resetOnHide.current = false
		attempt.current = null
		inFlight.current = false
		photos.reset()
		form.reset(undefined, { keepFieldsRef: true })
		setAlert(undefined)
		setLeaving(false)
	}, [form, photos])

	function showResult(result: SaveRecipeResult) {
		// The alert above the form keeps Retry and details; the toast reports the outcome wherever the user is looking.
		toast.error(toastMessage(result, messages))
		if (result.status !== 'unknown') attempt.current = null
		if (result.status !== 'invalid') {
			setAlert({ status: result.status, message: result.message, details: [] })
			return
		}
		const { fields, unmapped } = mapSaveFieldErrors(result.fieldErrors, form.getValues())
		for (const { path, message } of fields) form.setError(path as FieldPath<RecipeFormValues>, { type: 'server', message })
		setAlert({ status: 'invalid', message: result.message, details: unmapped })
		setFocusRequest((count) => count + 1)
	}

	function save(values: RecipeFormValues) {
		if (inFlight.current) return
		const prepared = prepareRecipePayload(mode, values)
		if (!prepared) {
			toast.error(messages.failed)
			setAlert({ status: 'invalid', message: messages.invalid, details: [] })
			return
		}
		if (attempt.current?.fingerprint !== prepared.fingerprint) attempt.current = { key: crypto.randomUUID(), fingerprint: prepared.fingerprint }
		const payload = prepared.build(attempt.current.key)

		inFlight.current = true
		setAlert(undefined)
		startTransition(async () => {
			const outcome = await attemptSave(onSave, payload, messages.unknown)
			if ('navigation' in outcome) {
				resetOnHide.current = true
				setLeaving(true)
				throw outcome.navigation
			}
			inFlight.current = false
			showResult(outcome.result)
		})
	}

	async function submit(event?: BaseSyntheticEvent) {
		const submitForm = form.handleSubmit(save, () => setAlert(undefined))
		if (!photos.isPreparing()) return submitForm(event)
		// The event is used after the wait, so its default (a page reload) must be stopped first.
		event?.preventDefault()
		setWaitingForPhotos(true)
		try {
			await photos.settled()
			await submitForm(event)
		} finally {
			// Cleared only after save() has started its transition, so Save never flickers back on in between.
			setWaitingForPhotos(false)
		}
	}

	return { busy: pending || leaving || waitingForPhotos, alert, focusRequest, submit, resetWhenHidden: () => { resetOnHide.current = true } }
}
