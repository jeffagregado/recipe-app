'use client'

import { useRef, useState, useTransition } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { useAppToast } from '@/lib/use-app-toast'
import { CATEGORY_MESSAGES, type SaveCategoriesResult } from '../actions/results'
import { toCategoryFormValues, toSaveCategoriesInput, type CategoryFormValues } from '../lib/category-form'

export type SaveCategoriesAction = (input: ReturnType<typeof toSaveCategoriesInput>) => Promise<SaveCategoriesResult>
type CategoryFormAlert = { message: string; reload: boolean }

type UseCategorySaveOptions = { form: UseFormReturn<CategoryFormValues>; onSave: SaveCategoriesAction }

/** Saving the set: the in-flight guard, the outcome toast, the alert above the list and server errors placed on their rows. */
export function useCategorySave({ form, onSave }: UseCategorySaveOptions) {
	const toast = useAppToast()
	const [pending, startTransition] = useTransition()
	const inFlight = useRef(false)
	const [alert, setAlert] = useState<CategoryFormAlert>()
	const [focusRequest, setFocusRequest] = useState(0)

	function showRejection(fieldErrors: Record<string, string[]>, message: string) {
		for (const [field, messages] of Object.entries(fieldErrors)) {
			if (field === 'categories' || !messages[0]) continue
			form.setError(`categories.${Number(field.split('.')[0])}.name`, { type: 'server', message: messages[0] })
		}
		setAlert({ message: fieldErrors.categories?.[0] ?? message, reload: false })
		setFocusRequest((count) => count + 1)
	}

	function showResult(result: SaveCategoriesResult) {
		if (result.status === 'saved') {
			toast.success(CATEGORY_MESSAGES.saved)
			// The refreshed page remounts the form with the stored list; until then the saved values are the clean state.
			form.reset(result.categories ? toCategoryFormValues(result.categories) : form.getValues())
			return
		}
		if (result.status === 'invalid') {
			toast.error(CATEGORY_MESSAGES.failed)
			showRejection(result.fieldErrors, result.message)
			return
		}
		toast.error(result.status === 'failed' ? CATEGORY_MESSAGES.failed : result.message)
		setAlert({ message: result.message, reload: result.status === 'stale' })
	}

	function send(values: CategoryFormValues) {
		if (inFlight.current) return
		inFlight.current = true
		setAlert(undefined)
		startTransition(async () => {
			let result: SaveCategoriesResult
			try { result = await onSave(toSaveCategoriesInput(values)) } catch { result = { status: 'failed', message: CATEGORY_MESSAGES.failed } }
			inFlight.current = false
			showResult(result)
		})
	}

	return { pending, alert, focusRequest, send, clearAlert: () => setAlert(undefined) }
}
