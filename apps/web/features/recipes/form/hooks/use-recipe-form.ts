'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef } from 'react'
import { useForm, useFormState } from 'react-hook-form'
import { createEmptyRecipeValues, recipeFormSchema, type RecipeFormValues } from '../lib/recipe-form-schema'
import type { RecipeFormMode } from '../lib/recipe-payload'
import { useRecipeSubmission, type SaveRecipeAction } from './use-recipe-submission'
import { useUnsavedChangesWarning } from './use-unsaved-changes-warning'

type UseRecipeFormOptions = { mode: RecipeFormMode; initialValues?: RecipeFormValues; onSave: SaveRecipeAction }

export function useRecipeForm({ mode, initialValues, onSave }: UseRecipeFormOptions) {
	const defaultValues = initialValues ?? createEmptyRecipeValues()
	const form = useForm<RecipeFormValues>({ resolver: zodResolver(recipeFormSchema), defaultValues, shouldFocusError: false })
	const formRef = useRef<HTMLFormElement>(null)
	const { busy, alert, focusRequest, submit, resetWhenHidden } = useRecipeSubmission({ form, mode, onSave })
	// Subscribed state: the form object keeps one identity, so reading form.formState here could be cached by the compiler.
	// React Hook Form publishes client validation errors, and bumps submitCount with them, only after the invalid callback returns.
	const { isDirty, submitCount } = useFormState({ control: form.control })

	// The first invalid control (document order) gets focus once its error has rendered.
	useEffect(() => {
		if (focusRequest > 0 || submitCount > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
	}, [focusRequest, submitCount])

	useUnsavedChangesWarning(isDirty)

	return { form, formRef, busy, alert, isDirty, submit, resetWhenHidden }
}
