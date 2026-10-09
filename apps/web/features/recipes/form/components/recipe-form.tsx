'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FormProvider } from 'react-hook-form'
import PageContainer from '@/components/layout/page-container'
import type { RecipeFormValues } from '../_lib/recipe-form-schema'
import { BasicInformationSection } from './basic-information-section'
import { CoverPhotoSection } from './cover-photo-section'
import { DiscardChangesDialog } from './discard-changes-dialog'
import { IngredientsSection } from './ingredients-section'
import { InstructionsSection } from './instructions-section'
import { NotesSection } from './notes-section'
import { RecipeFormAlert } from './recipe-form-alert'
import { RecipeFormHeader } from './recipe-form-header'
import { useRecipeForm, type SaveRecipeAction } from './use-recipe-form'

type RecipeFormProps = {
	title: string
	submitLabel: string
	cancelHref: string
	onSave: SaveRecipeAction
	initialValues?: RecipeFormValues
}

/** Free of create-only assumptions: title, submit label, initial values, destination on cancel and the save action are props. */
export function RecipeForm({ title, submitLabel, cancelHref, onSave, initialValues }: RecipeFormProps) {
	const router = useRouter()
	const { form, formRef, busy, alert, isDirty, submit } = useRecipeForm({ initialValues, onSave })
	const [confirmingDiscard, setConfirmingDiscard] = useState(false)

	function cancel() {
		if (isDirty) setConfirmingDiscard(true)
		else router.push(cancelHref)
	}

	function discard() {
		setConfirmingDiscard(false)
		router.push(cancelHref)
	}

	return (
		<FormProvider {...form}>
			<form ref={formRef} noValidate onSubmit={submit} aria-busy={busy} aria-label={title}>
				<RecipeFormHeader title={title} submitLabel={submitLabel} busy={busy} onCancel={cancel} />
				<PageContainer className="space-y-4 pb-8 sm:space-y-5">
					<p role="status" className="sr-only">{busy ? 'Saving recipe…' : ''}</p>
					{alert && <RecipeFormAlert alert={alert} busy={busy} onRetry={() => void submit()} />}
					<div className="grid gap-4 sm:gap-5 xl:grid-cols-12 xl:items-start">
						<div className="space-y-4 sm:space-y-5 xl:col-span-5">
							<BasicInformationSection />
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
			<DiscardChangesDialog open={confirmingDiscard} onOpenChange={setConfirmingDiscard} onDiscard={discard} />
		</FormProvider>
	)
}
