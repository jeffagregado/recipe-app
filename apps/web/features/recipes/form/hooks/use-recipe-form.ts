'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm, useFormState } from 'react-hook-form'
import { createEmptyRecipeValues, photoSlotPath, recipeFormSchema, type RecipeFormValues } from '../lib/recipe-form-schema'
import type { RecipeFormMode } from '../lib/recipe-payload'
import { limitUploads, type PhotoDiscarder, type PhotoUploader } from '../lib/upload-pending-photo'
import { createPhotoSlots } from './photo-slots'
import { useRecipeSubmission, type SaveRecipeAction } from './use-recipe-submission'
import { useUnsavedChangesWarning } from './use-unsaved-changes-warning'

type UseRecipeFormOptions = { mode: RecipeFormMode; initialValues?: RecipeFormValues; onSave: SaveRecipeAction; onUploadPhoto: PhotoUploader; onDiscardPhoto: PhotoDiscarder }

export function useRecipeForm({ mode, initialValues, onSave, onUploadPhoto, onDiscardPhoto }: UseRecipeFormOptions) {
	const defaultValues = initialValues ?? createEmptyRecipeValues()
	const form = useForm<RecipeFormValues>({ resolver: zodResolver(recipeFormSchema), defaultValues, shouldFocusError: false })
	const formRef = useRef<HTMLFormElement>(null)
	const [photos] = useState(() => createPhotoSlots({
		read: (slot) => {
			const path = photoSlotPath(form.getValues(), slot)
			return path && form.getValues(path)
		},
		write: (slot, photo) => {
			const path = photoSlotPath(form.getValues(), slot)
			if (!path) return
			// A new photo answers any earlier problem with the slot, including one the server reported.
			form.clearErrors(path)
			form.setValue(path, photo, { shouldDirty: true, shouldTouch: true })
		},
		all: () => {
			const { cover, instructions } = form.getValues()
			return [cover, ...instructions.flatMap((group) => group.steps.map((step) => step.photo))]
		},
		upload: limitUploads(onUploadPhoto),
		discard: onDiscardPhoto,
	}))
	const { busy, alert, focusRequest, submit, resetWhenHidden } = useRecipeSubmission({ form, mode, onSave, photos })
	// Subscribed state: the form object keeps one identity, so reading form.formState here could be cached by the compiler.
	// React Hook Form publishes client validation errors, and bumps submitCount with them, only after the invalid callback returns.
	const { isDirty, submitCount } = useFormState({ control: form.control })

	// The first invalid control (document order) gets focus once its error has rendered.
	useEffect(() => {
		if (focusRequest > 0 || submitCount > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
	}, [focusRequest, submitCount])

	useUnsavedChangesWarning(isDirty)

	// Closing or reloading the page, past that warning, abandons the form. A save still running may use its Pending photos,
	// and a page the browser keeps to come back to still needs them.
	useEffect(() => {
		if (busy) return
		const leave = (event: PageTransitionEvent) => { if (!event.persisted) photos.abandon() }
		window.addEventListener('pagehide', leave)
		return () => window.removeEventListener('pagehide', leave)
	}, [busy, photos])

	return { form, formRef, photos, busy, alert, isDirty, submit, resetWhenHidden }
}
