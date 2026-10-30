'use client'

import type { Category } from '@recipe-app/contracts/types'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormProvider } from 'react-hook-form'
import PageContainer from '@/components/layout/page-container'
import type { RecipeFormValues } from '../lib/recipe-form-schema'
import type { RecipeFormMode } from '../lib/recipe-payload'
import { BasicInformationSection } from './basic-information-section'
import { CoverPhotoSection } from './cover-photo-section'
import { DiscardChangesDialog } from './discard-changes-dialog'
import { IngredientsSection } from './ingredients-section'
import { InstructionsSection } from './instructions-section'
import { NotesSection } from './notes-section'
import { RecipeFormAlert } from './recipe-form-alert'
import { RecipeFormHeader } from './recipe-form-header'
import { PhotoSlotsContext } from '../hooks/photo-slots'
import { useRecipeForm } from '../hooks/use-recipe-form'
import type { SaveRecipeAction } from '../hooks/use-recipe-submission'
import type { PhotoUploader } from '../lib/upload-pending-photo'

type RecipeFormProps = {
	mode: RecipeFormMode
	title: string
	submitLabel: string
	cancelHref: string
	onSave: SaveRecipeAction
	/** Uploads a picked photo as a Pending photo; tests pass a stand-in. */
	onUploadPhoto: PhotoUploader
	/** The user's own categories, offered as chips. */
	categories: Category[]
	initialValues?: RecipeFormValues
}

/**
 * Shared by Create and Edit: the mode, title, submit label, initial values, destination on cancel, the save action and the photo uploader are props.
 * Mount it with a `key` that changes when the stored recipe does, so a revisit never shows values from before a save.
 */
export function RecipeForm({ mode, title, submitLabel, cancelHref, onSave, onUploadPhoto, categories, initialValues }: RecipeFormProps) {
	const router = useRouter()
	const { form, formRef, photos, busy, alert, isDirty, submit, resetWhenHidden } = useRecipeForm({ mode, initialValues, onSave, onUploadPhoto })
	const [confirmingDiscard, setConfirmingDiscard] = useState(false)

	function cancel() {
		if (isDirty) setConfirmingDiscard(true)
		else router.push(cancelHref)
	}

	function discard() {
		setConfirmingDiscard(false)
		// The page stays mounted (hidden) after leaving; the discarded values must not greet the next visit.
		resetWhenHidden()
		router.push(cancelHref)
	}

	return (
		<FormProvider {...form}>
			<PhotoSlotsContext value={photos}>
				<form ref={formRef} noValidate onSubmit={submit} aria-busy={busy} aria-label={title}>
					<RecipeFormHeader title={title} submitLabel={submitLabel} busy={busy} onCancel={cancel} />
					<PageContainer className="space-y-4 pb-8 sm:space-y-5">
						<p role="status" className="sr-only">{busy ? 'Saving recipe…' : ''}</p>
						{alert && <RecipeFormAlert alert={alert} busy={busy} onRetry={() => void submit()} />}
						<div className="grid gap-4 sm:gap-5 xl:grid-cols-12 xl:items-start">
							<div className="space-y-4 sm:space-y-5 xl:col-span-5">
								<BasicInformationSection categories={categories} />
								<CoverPhotoSection disabled={busy} />
							</div>
							<div className="space-y-4 sm:space-y-5 xl:col-span-7">
								<IngredientsSection />
								<InstructionsSection disabled={busy} />
							</div>
						</div>
						<NotesSection />
					</PageContainer>
				</form>
			</PhotoSlotsContext>
			<DiscardChangesDialog open={confirmingDiscard} onOpenChange={setConfirmingDiscard} onDiscard={discard} />
		</FormProvider>
	)
}
