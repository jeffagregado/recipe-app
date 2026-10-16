'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import type { CategoryWithUsage } from '@recipe-app/contracts/types'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type BaseSyntheticEvent } from 'react'
import { FormProvider, useFieldArray, useForm, useFormState } from 'react-hook-form'
import PageContainer from '@/components/layout/page-container'
import { Button } from '@/components/ui/button'
import { DiscardChangesDialog } from '@/features/recipes/form/components/discard-changes-dialog'
import { RecipeFormHeader } from '@/features/recipes/form/components/recipe-form-header'
import { useUnsavedChangesWarning } from '@/features/recipes/form/hooks/use-unsaved-changes-warning'
import { saveCategories } from '../actions/save-categories'
import { useCategorySave, type SaveCategoriesAction } from '../hooks/use-category-save'
import { categoryFormSchema, removedInUse, restoreCategories, toCategoryFormValues, MAX_CATEGORIES, type CategoryFormValues } from '../lib/category-form'
import { CategoryList } from './category-list'
import { RemoveCategoriesDialog } from './remove-categories-dialog'

type CategoriesFormProps = {
	/** The stored list this form opens with. Mount with a `key` that changes when it does, so a saved form starts clean. */
	categories: CategoryWithUsage[]
	onSave?: SaveCategoriesAction
}

/** One form for the whole set, like the recipe form's ingredient rows: edit, add and remove rows, then save them together. */
export function CategoriesForm({ categories, onSave = saveCategories }: CategoriesFormProps) {
	const router = useRouter()
	const form = useForm<CategoryFormValues>({ resolver: zodResolver(categoryFormSchema), defaultValues: toCategoryFormValues(categories), shouldFocusError: false })
	const rows = useFieldArray({ control: form.control, name: 'categories' })
	// Subscribed state: the form object keeps one identity, so reading form.formState here could be cached by the compiler.
	const { isDirty, submitCount } = useFormState({ control: form.control })
	const formRef = useRef<HTMLFormElement>(null)
	const { pending, alert, focusRequest, send, clearAlert } = useCategorySave({ form, onSave })
	const [confirmingDiscard, setConfirmingDiscard] = useState(false)
	/** Removed categories that still tag recipes; the list outlives `open` so the dialog keeps its text while it closes. */
	const [removal, setRemoval] = useState<{ open: boolean; removed: CategoryWithUsage[] }>({ open: false, removed: [] })

	useUnsavedChangesWarning(isDirty)

	// The first invalid name (document order) gets focus once its error has rendered.
	useEffect(() => {
		if (focusRequest > 0 || submitCount > 0) formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
	}, [focusRequest, submitCount])

	function save(values: CategoryFormValues) {
		const losingTags = removedInUse(categories, values.categories)
		if (losingTags.length > 0) setRemoval({ open: true, removed: losingTags })
		else send(values)
	}

	function submit(event?: BaseSyntheticEvent) {
		return form.handleSubmit(save, clearAlert)(event)
	}

	function confirmRemoval() {
		setRemoval(({ removed }) => ({ open: false, removed }))
		send(form.getValues())
	}

	/** "Keep" puts the categories back; there is no other way to undo a removed row short of discarding every change. */
	function keepRemoved() {
		const current = form.getValues('categories')
		if (current.length + removal.removed.length <= MAX_CATEGORIES) rows.replace(restoreCategories(categories, current, removal.removed))
		setRemoval(({ removed }) => ({ open: false, removed }))
	}

	function cancel() {
		if (isDirty) setConfirmingDiscard(true)
		else router.push('/recipes')
	}

	function discard() {
		setConfirmingDiscard(false)
		// The page stays mounted (hidden) after leaving; the discarded values must not greet the next visit.
		form.reset()
		router.push('/recipes')
	}

	return (
		<FormProvider {...form}>
			<form ref={formRef} noValidate onSubmit={submit} aria-busy={pending} aria-label="Categories">
				<RecipeFormHeader
					title="Categories"
					description="Rename, add or remove the categories you tag recipes with."
					submitLabel="Save"
					submitLabelDetail="Categories"
					busy={pending}
					onCancel={cancel}
				/>
				<PageContainer className="space-y-6 pb-8">
					<p role="status" className="sr-only">{pending ? 'Saving categories…' : ''}</p>
					{alert && (
						<div role="alert" className="flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
							<p className="font-medium text-destructive">{alert.message}</p>
							{alert.reload && <Button type="button" variant="outline" className="h-11 px-4" onClick={() => window.location.reload()}>Reload</Button>}
						</div>
					)}
					<CategoryList stored={categories} rows={rows} disabled={pending} />
				</PageContainer>
			</form>
			<DiscardChangesDialog open={confirmingDiscard} onOpenChange={setConfirmingDiscard} onDiscard={discard} description="Your changes to your categories will be lost." />
			<RemoveCategoriesDialog open={removal.open} removed={removal.removed} onKeep={keepRemoved} onRemove={confirmRemoval} />
		</FormProvider>
	)
}
