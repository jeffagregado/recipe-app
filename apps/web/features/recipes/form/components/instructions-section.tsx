import { ImagePlus, ListOrdered } from 'lucide-react'
import { useFormContext, useWatch, useFormState } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { emptyInstructionRow, MAX_ROWS, type RecipeFormValues } from '../lib/recipe-form-schema'
import { fieldA11y, textareaClass } from '../lib/field-props'
import { IMAGE_HINT } from '../lib/recipe-files'
import { newPhoto, noPhoto, photoCaption } from '../lib/recipe-photo'
import { FieldError, FieldStatus } from './form-field'
import { PhotoPicker } from './photo-picker'
import { PhotoPreview } from './photo-preview'
import { RowControls } from './row-controls'
import { SectionCard } from './section-card'
import { usePhotoPick } from '../hooks/use-photo-pick'
import { useRowGroups } from '../hooks/use-row-groups'
import { AddHeadingLink, AddRowControls, GroupHeading } from './row-group'

type InstructionRowProps = {
	group: number
	row: number
	position: number
	disabled: boolean
	canMove: (direction: 'up' | 'down') => boolean
	onMove: (direction: 'up' | 'down') => void
	onRemove: () => void
}

export function InstructionsSection({ disabled }: { disabled: boolean }) {
	const { control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	// Each row owns its photo, so a photo always travels with its step, across groups too.
	const { containerRef, ...steps } = useRowGroups({ name: 'instructions', key: 'steps', empty: emptyInstructionRow, control: 'description' })
	const listError = errors.instructions?.message ?? errors.instructions?.root?.message
	const atLimit = steps.total >= MAX_ROWS.instructions

	return (
		<SectionCard icon={ListOrdered} title="Instructions" required>
			<div ref={containerRef} className="space-y-5">
				{steps.groups.map((field, group) => (
					<div key={field.id} data-group={group} className={cn('space-y-5', group > 0 && 'border-t border-border pt-5')}>
						{/* Only the first group can be untitled; then it offers "Add heading". */}
						{field.heading === null ? (
							<AddHeadingLink onClick={steps.nameFirstGroup} />
						) : (
							<GroupHeading
								list="instructions"
								group={group}
								placeholder="Group name, such as Make the sauce"
								canMove={(direction) => steps.canMoveGroup(group, direction)}
								onMove={(direction) => steps.moveGroup(group, direction)}
								onRemoveHeading={() => steps.removeHeading(group)}
							/>
						)}
						<ol className="space-y-5">
							{field.steps.map((_, row) => (
								<InstructionRow
									key={`${field.id}-${row}`}
									group={group}
									row={row}
									position={steps.startOf(group) + row + 1}
									disabled={disabled}
									canMove={(direction) => steps.canMoveRow(group, row, direction)}
									onMove={(direction) => steps.moveRow(group, row, direction)}
									onRemove={() => steps.removeRow(group, row)}
								/>
							))}
						</ol>
						<AddRowControls
							addLabel="Add step"
							limitText={`You’ve reached the limit of ${MAX_ROWS.instructions} steps.`}
							atLimit={atLimit}
							onAdd={() => steps.addRow(group)}
							onAddGroup={group === steps.groups.length - 1 ? steps.addGroup : undefined}
						/>
					</div>
				))}
			</div>
			{listError && <FieldError id="recipe-instructions-error">{listError}</FieldError>}
		</SectionCard>
	)
}

function InstructionRow({ group, row, position, disabled, canMove, onMove, onRemove }: InstructionRowProps) {
	const { register, control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const fieldId = `recipe-step-${position - 1}`
	const description = errors.instructions?.[group]?.steps?.[row]?.description?.message

	return (
		<li className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-3 sm:gap-x-3" data-row={position - 1}>
			<span aria-hidden="true" className="row-start-1 grid size-8 place-items-center self-center rounded-full bg-primary text-sm font-semibold text-primary-foreground sm:mt-1.5 sm:self-start">{position}</span>
			<label htmlFor={fieldId} className="row-start-1 self-center text-sm font-medium sm:sr-only">
				Step {position}<span className="sr-only"> instructions</span>
			</label>
			<div className="col-span-3 row-start-2 space-y-1.5 sm:col-span-1 sm:col-start-2 sm:row-start-1">
				<textarea
					{...fieldA11y(fieldId, description)}
					{...register(`instructions.${group}.steps.${row}.description`)}
					className={textareaClass}
					rows={3}
					data-control="description"
				/>
				{description && <FieldError id={`${fieldId}-error`}>{description}</FieldError>}
			</div>
			<RowControls noun="step" position={position} canMove={canMove} onMove={onMove} onRemove={onRemove} className="col-start-3 row-start-1 sm:self-start" />
			<div className="col-span-3 row-start-3 sm:col-span-2 sm:col-start-2 sm:row-start-2">
				<StepPhoto group={group} row={row} position={position} disabled={disabled} />
			</div>
		</li>
	)
}

function StepPhoto({ group, row, position, disabled }: { group: number; row: number; position: number; disabled: boolean }) {
	const { control, setValue } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const path = `instructions.${group}.steps.${row}.photo` as const
	const photo = useWatch({ control, name: path })
	const { pickError, preparing, pick, remove } = usePhotoPick((file) => setValue(path, file ? newPhoto(file) : noPhoto(), { shouldDirty: true, shouldTouch: true }))
	const error = pickError ?? errors.instructions?.[group]?.steps?.[row]?.photo?.message
	const fieldId = `recipe-step-${position - 1}-photo`
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
					<span className="text-xs text-muted-foreground">Optional · {IMAGE_HINT}</span>
				</div>
			)}
			{preparing && <FieldStatus>Preparing photo…</FieldStatus>}
			{error && <FieldError id={`${fieldId}-error`}>{error}</FieldError>}
		</div>
	)
}
