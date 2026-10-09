'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { createRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { unstable_rethrow } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState, useTransition, type BaseSyntheticEvent } from 'react'
import { useForm, useFormState, type FieldPath } from 'react-hook-form'
import { buildRecipeFormData } from '../_lib/build-recipe-form-data'
import { mapSaveFieldErrors } from '../_lib/map-save-errors'
import { createEmptyRecipeValues, recipeFormSchema, toCreateRecipeMetadata, type RecipeFormValues } from '../_lib/recipe-form-schema'
import { SAVE_MESSAGES, type SaveRecipeResult } from '../_lib/save-recipe-result'

export type SaveRecipeAction = (formData: FormData) => Promise<SaveRecipeResult>
export type FormAlert = { status: SaveRecipeResult['status']; message: string; details: string[] }

type UseRecipeFormOptions = { initialValues?: RecipeFormValues; onSave: SaveRecipeAction }

/** Returns the redirect or not-found error Next throws out of a Server Action, or null for ordinary failures. */
function navigationError(error: unknown): unknown {
	try { unstable_rethrow(error) } catch (navigation) { return navigation }
	return null
}

const fileSignature = (file: File | null) => (file ? `${file.name}:${file.size}:${file.lastModified}` : null)

export function useRecipeForm({ initialValues, onSave }: UseRecipeFormOptions) {
	const defaultValues = initialValues ?? createEmptyRecipeValues()
	const form = useForm<RecipeFormValues>({ resolver: zodResolver(recipeFormSchema), defaultValues, shouldFocusError: false })
	const formRef = useRef<HTMLFormElement>(null)
	const [pending, startTransition] = useTransition()
	// The redirect after a confirmed save ends the transition slightly before the new page appears; stay disabled until then.
	const [leaving, setLeaving] = useState(false)
	const [alert, setAlert] = useState<FormAlert>()
	const [focusRequest, setFocusRequest] = useState(0)
	// One submission key per attempt: reused only for the same payload after an unknown outcome.
	const attempt = useRef<{ key: string; fingerprint: string } | null>(null)
	const inFlight = useRef(false)
	const saved = useRef(false)
	// Subscribed state: the form object keeps one identity, so reading form.formState here could be cached by the compiler.
	const { isDirty, submitCount } = useFormState({ control: form.control })
	// React Hook Form publishes client validation errors, and bumps submitCount with them, only after the invalid callback returns.
	const busy = pending || leaving

	// The first invalid control (document order) gets focus once its error has rendered.
	useEffect(() => {
		if (focusRequest > 0 || submitCount > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
	}, [focusRequest, submitCount])

	useEffect(() => {
		if (!isDirty) return
		const warn = (event: BeforeUnloadEvent) => event.preventDefault()
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [isDirty])

	// Cache Components keeps hidden pages mounted; start the next visit empty once a save has navigated away.
	useLayoutEffect(() => () => {
		if (!saved.current) return
		saved.current = false
		attempt.current = null
		inFlight.current = false
		form.reset(undefined, { keepFieldsRef: true })
		setAlert(undefined)
		setLeaving(false)
	}, [form])

	function showResult(result: SaveRecipeResult) {
		if (result.status !== 'unknown') attempt.current = null
		if (result.status !== 'invalid') {
			setAlert({ status: result.status, message: result.message, details: [] })
			return
		}
		const { fields, unmapped } = mapSaveFieldErrors(result.fieldErrors)
		for (const { path, message } of fields) form.setError(path as FieldPath<RecipeFormValues>, { type: 'server', message })
		setAlert({ status: 'invalid', message: result.message, details: unmapped })
		setFocusRequest((count) => count + 1)
	}

	function save(values: RecipeFormValues) {
		if (inFlight.current) return
		const parsed = createRecipeMetadataSchema.safeParse(toCreateRecipeMetadata(values))
		if (!parsed.success) {
			setAlert({ status: 'invalid', message: SAVE_MESSAGES.invalid, details: [] })
			return
		}
		const metadata = parsed.data
		const files = { cover: values.cover, steps: values.instructions.map((step) => step.photo) }
		const fingerprint = JSON.stringify([metadata, fileSignature(files.cover), files.steps.map(fileSignature)])
		if (attempt.current?.fingerprint !== fingerprint) attempt.current = { key: crypto.randomUUID(), fingerprint }
		const payload = buildRecipeFormData(metadata, files, attempt.current.key)

		inFlight.current = true
		setAlert(undefined)
		startTransition(async () => {
			let result: SaveRecipeResult
			try {
				result = await onSave(payload)
			} catch (error) {
				// A successful save redirects, which surfaces here as a navigation error that React and Next must receive.
				const navigation = navigationError(error)
				if (navigation) {
					saved.current = true
					setLeaving(true)
					throw navigation
				}
				result = { status: 'unknown', message: SAVE_MESSAGES.unknown }
			}
			inFlight.current = false
			showResult(result)
		})
	}

	function submit(event?: BaseSyntheticEvent) {
		return form.handleSubmit(save, () => setAlert(undefined))(event)
	}

	return { form, formRef, busy, alert, isDirty, submit }
}
