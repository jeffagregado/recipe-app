import { ImagePlus, ListOrdered, Plus } from 'lucide-react'
import { useFieldArray, useFormContext, useWatch, useFormState } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { emptyInstructionRow, MAX_ROWS, type RecipeFormValues } from '../lib/recipe-form-schema'
import { fieldA11y, textareaClass } from '../lib/field-props'
import { newPhoto, noPhoto, photoCaption } from '../lib/recipe-photo'
import { FieldError } from './form-field'
import { PhotoPicker } from './photo-picker'
import { PhotoPreview } from './photo-preview'
import { RowControls } from './row-controls'
import { SectionCard } from './section-card'
import { usePhotoPick } from '../hooks/use-photo-pick'
import { useRowActions } from '../hooks/use-row-actions'

type InstructionRowProps = { index: number; count: number; disabled: boolean; onMove: (direction: 'up' | 'down') => void; onRemove: () => void }

export function InstructionsSection({ disabled }: { disabled: boolean }) {
	const { control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const { fields, append, remove, move, update } = useFieldArray({ control, name: 'instructions' })
	// Each row owns its photo, so a photo always travels with its step.
	const { listRef, focusNewRow, moveRow, removeRow } = useRowActions<HTMLOListElement>({
		count: fields.length, control: 'description', move, remove, clear: () => update(0, emptyInstructionRow()),
	})
	const listError = errors.instructions?.message ?? errors.instructions?.root?.message

	function add() {
		focusNewRow()
		append(emptyInstructionRow(), { shouldFocus: false })
	}

	return (
		<SectionCard icon={ListOrdered} title="Instructions" required>
			<ol ref={listRef} className="space-y-5">
				{fields.map((field, index) => (
					<InstructionRow key={field.id} index={index} count={fields.length} disabled={disabled} onMove={(direction) => moveRow(index, direction)} onRemove={() => removeRow(index)} />
				))}
			</ol>
			{listError && <FieldError id="recipe-instructions-error">{listError}</FieldError>}
			{fields.length < MAX_ROWS.instructions ? (
				<Button type="button" variant="outline" className="h-11 w-full border-dashed" onClick={add}>
					<Plus aria-hidden="true" /> Add step
				</Button>
			) : (
				<p className="text-sm text-muted-foreground">You’ve reached the limit of {MAX_ROWS.instructions} steps.</p>
			)}
		</SectionCard>
	)
}

function InstructionRow({ index, count, disabled, onMove, onRemove }: InstructionRowProps) {
	const { register, control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const position = index + 1
	const fieldId = `recipe-step-${index}`
	const description = errors.instructions?.[index]?.description?.message

	return (
		<li className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-3 sm:gap-x-3">
			<span aria-hidden="true" className="row-start-1 grid size-8 place-items-center self-center rounded-full bg-primary text-sm font-semibold text-primary-foreground sm:mt-1.5 sm:self-start">{position}</span>
			<label htmlFor={fieldId} className="row-start-1 self-center text-sm font-medium sm:sr-only">
				Step {position}<span className="sr-only"> instructions</span>
			</label>
			<div className="col-span-3 row-start-2 space-y-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
				<textarea
					{...fieldA11y(fieldId, description)}
					{...register(`instructions.${index}.description`)}
					className={textareaClass}
					rows={3}
					data-control="description"
				/>
				{description && <FieldError id={`${fieldId}-error`}>{description}</FieldError>}
			</div>
			<RowControls noun="step" position={position} count={count} onMove={onMove} onRemove={onRemove} className="col-start-3 row-start-1 sm:self-start" />
			<div className="col-span-3 row-start-3 sm:col-span-2 sm:col-start-2 sm:row-start-2">
				<StepPhoto index={index} disabled={disabled} />
			</div>
		</li>
	)
}

function StepPhoto({ index, disabled }: { index: number; disabled: boolean }) {
	const { control, setValue } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const photo = useWatch({ control, name: `instructions.${index}.photo` })
	const { pickError, pick, remove } = usePhotoPick((file) => setValue(`instructions.${index}.photo`, file ? newPhoto(file) : noPhoto(), { shouldDirty: true, shouldTouch: true }))
	const position = index + 1
	const error = pickError ?? errors.instructions?.[index]?.photo?.message
	const fieldId = `recipe-step-${index}-photo`
	const a11y = fieldA11y(fieldId, error)

	return (
		<div className="space-y-1.5">
			{photo.kind !== 'none' ? (
				<div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3">
					<PhotoPreview photo={photo} label={`Current photo for step ${position}`} sizes="56px" className="size-14 shrink-0 rounded-lg" />
					<p className="min-w-0 flex-1 basis-16 text-sm text-muted-foreground wrap-break-word">{photoCaption(photo)}</p>
					<PhotoPicker label={`Replace photo for step ${position}`} onPick={pick} disabled={disabled} a11y={a11y} className="rounded-lg">
						<span className="inline-flex h-11 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium sm:px-4">Replace</span>
					</PhotoPicker>
					<Button type="button" variant="outline" className="h-11 px-3 sm:px-4" aria-label={`Remove photo from step ${position}`} disabled={disabled} onClick={remove}>Remove</Button>
				</div>
			) : (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<PhotoPicker label={`Add photo to step ${position}`} onPick={pick} disabled={disabled} a11y={a11y} className="w-full rounded-lg sm:w-auto">
						<span className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-input px-4 text-sm font-medium hover:bg-muted/50 sm:w-auto">
							<ImagePlus aria-hidden="true" className="size-4" /> Add photo
						</span>
					</PhotoPicker>
					<span className="text-xs text-muted-foreground">Optional · JPG, PNG or WebP · up to 5 MB</span>
				</div>
			)}
			{error && <FieldError id={`${fieldId}-error`}>{error}</FieldError>}
		</div>
	)
}
