import { ChevronDown, ChevronUp, ListPlus, Plus } from 'lucide-react'
import { useFormContext, useFormState } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { fieldA11y, inputClass } from '../lib/field-props'
import type { RecipeFormValues } from '../lib/recipe-form-schema'
import type { Direction } from '../lib/row-groups'
import { FieldError } from './form-field'

type GroupHeadingProps = {
	list: 'ingredients' | 'instructions'
	group: number
	placeholder: string
	canMove: (direction: Direction) => boolean
	onMove: (direction: Direction) => void
	onRemoveHeading: () => void
}

/** The quiet link that gives the untitled first group a heading. */
export function AddHeadingLink({ onClick }: { onClick: () => void }) {
	return (
		<Button type="button" variant="link" className="h-11 px-0 text-muted-foreground" data-control="add-heading" onClick={onClick}>
			<Plus aria-hidden="true" /> Add heading
		</Button>
	)
}

/** The heading line of a named group: its name, move up and down among later groups (the first group stays first), and "Remove heading". */
export function GroupHeading({ list, group, placeholder, canMove, onMove, onRemoveHeading }: GroupHeadingProps) {
	const { register, control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const noun = list === 'ingredients' ? 'ingredient group' : 'step group'
	const label = group === 0 ? `first ${noun}` : `${noun} ${group}`
	const id = `recipe-${list}-group-${group}`
	const error = errors[list]?.[group]?.heading?.message

	return (
		<div className="space-y-1.5">
			<div className="flex flex-wrap items-center gap-x-1 gap-y-2">
				<Input
					{...fieldA11y(id, error)}
					{...register(`${list}.${group}.heading`)}
					className={cn(inputClass, 'basis-full font-semibold sm:flex-1 sm:basis-auto')}
					aria-label={`${label.charAt(0).toUpperCase()}${label.slice(1)} name`}
					placeholder={placeholder}
					data-group-heading={group}
					autoComplete="off"
				/>
				<div className="ml-auto flex shrink-0 items-center">
					{group > 0 && (['up', 'down'] as const).map((direction) => (
						<Button
							key={direction}
							type="button"
							variant="ghost"
							size="icon"
							className="size-11"
							aria-label={`Move ${label} ${direction}`}
							data-control={`group-${direction}`}
							disabled={!canMove(direction)}
							onClick={() => onMove(direction)}
						>
							{direction === 'up' ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
						</Button>
					))}
					<Button type="button" variant="ghost" className="h-11 px-3" aria-label={`Remove heading from ${label}`} onClick={onRemoveHeading}>
						Remove heading
					</Button>
				</div>
			</div>
			{error && <FieldError id={`${id}-error`}>{error}</FieldError>}
		</div>
	)
}

type AddRowControlsProps = {
	addLabel: string
	limitText: string
	atLimit: boolean
	onAdd: () => void
	/** Shown beside the last group's add button only. */
	onAddGroup?: () => void
}

/** A group's dashed add-row button, with the quieter "Add group" beside the last one; the limit text replaces both. */
export function AddRowControls({ addLabel, limitText, atLimit, onAdd, onAddGroup }: AddRowControlsProps) {
	if (atLimit) return <p className="text-sm text-muted-foreground">{limitText}</p>
	return (
		<div className="flex flex-wrap gap-2">
			<Button type="button" variant="outline" className="h-11 min-w-0 flex-1 border-dashed" onClick={onAdd}>
				<Plus aria-hidden="true" /> {addLabel}
			</Button>
			{onAddGroup && (
				<Button type="button" variant="ghost" className="h-11 px-3 text-muted-foreground" onClick={onAddGroup}>
					<ListPlus aria-hidden="true" /> Add group
				</Button>
			)}
		</div>
	)
}
