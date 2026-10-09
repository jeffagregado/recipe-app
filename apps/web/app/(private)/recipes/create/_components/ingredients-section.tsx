import { MEASUREMENT_UNITS } from '@recipe-app/contracts/types'
import { ClipboardList, Plus } from 'lucide-react'
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { emptyIngredientRow, MAX_ROWS, TO_TASTE, type RecipeFormValues } from '../_lib/recipe-form-schema'
import { fieldA11y, inputClass, selectClass } from '../_lib/field-props'
import { FieldError } from './form-field'
import { RowControls } from './row-controls'
import { SectionCard } from './section-card'
import { useRowFocus } from './use-row-focus'

type IngredientRowProps = { index: number; count: number; onMove: (direction: 'up' | 'down') => void; onRemove: () => void }

const ROW_GRID = 'sm:grid sm:grid-cols-[minmax(0,1fr)_5.5rem_8.5rem_auto] sm:items-center sm:gap-2'

export function IngredientsSection() {
	const { control, formState: { errors } } = useFormContext<RecipeFormValues>()
	const { fields, append, remove, move, update } = useFieldArray({ control, name: 'ingredients' })
	const { listRef, focusRow } = useRowFocus<HTMLOListElement>()
	const listError = errors.ingredients?.message ?? errors.ingredients?.root?.message

	function add() {
		focusRow({ index: fields.length, controls: ['name'] })
		append(emptyIngredientRow(), { shouldFocus: false })
	}

	function moveRow(index: number, direction: 'up' | 'down') {
		const target = direction === 'up' ? index - 1 : index + 1
		focusRow({ index: target, controls: direction === 'up' ? ['move-up', 'move-down'] : ['move-down', 'move-up'] })
		move(index, target)
	}

	// The last remaining row is cleared instead of removed: at least one row is always required.
	function removeRow(index: number) {
		if (fields.length === 1) {
			focusRow({ index: 0, controls: ['name'] })
			update(0, emptyIngredientRow())
			return
		}
		focusRow({ index: Math.min(index, fields.length - 2), controls: ['name'] })
		remove(index)
	}

	return (
		<SectionCard icon={ClipboardList} title="Ingredients" required>
			<div aria-hidden="true" className={cn('hidden px-0.5 text-xs text-muted-foreground', ROW_GRID)}>
				<span>Ingredient</span>
				<span>Amount</span>
				<span>Unit</span>
				<span className="w-33" />
			</div>
			<ol ref={listRef} className="space-y-4 sm:space-y-3">
				{fields.map((field, index) => (
					<IngredientRow key={field.id} index={index} count={fields.length} onMove={(direction) => moveRow(index, direction)} onRemove={() => removeRow(index)} />
				))}
			</ol>
			{listError && <FieldError id="recipe-ingredients-error">{listError}</FieldError>}
			{fields.length < MAX_ROWS.ingredients ? (
				<Button type="button" variant="outline" className="h-11 w-full border-dashed" onClick={add}>
					<Plus aria-hidden="true" /> Add ingredient
				</Button>
			) : (
				<p className="text-sm text-muted-foreground">You’ve reached the limit of {MAX_ROWS.ingredients} ingredients.</p>
			)}
		</SectionCard>
	)
}

function IngredientRow({ index, count, onMove, onRemove }: IngredientRowProps) {
	const { register, setValue, control, formState: { errors } } = useFormContext<RecipeFormValues>()
	const unit = useWatch({ control, name: `ingredients.${index}.unit` })
	const rowErrors = errors.ingredients?.[index]
	const position = index + 1
	const base = `recipe-ingredient-${index}`
	const toTaste = unit === TO_TASTE
	const unitField = register(`ingredients.${index}.unit`)

	return (
		<li className="space-y-1.5">
			<div className={cn('flex flex-wrap items-center gap-2', ROW_GRID)}>
				<Input
					{...fieldA11y(`${base}-name`, rowErrors?.name?.message)}
					{...register(`ingredients.${index}.name`)}
					className={cn(inputClass, 'basis-full sm:basis-auto')}
					aria-label={`Ingredient ${position} name`}
					data-control="name"
					autoComplete="off"
				/>
				<Input
					{...fieldA11y(`${base}-amount`, rowErrors?.amount?.message)}
					{...register(`ingredients.${index}.amount`)}
					className={cn(inputClass, 'w-20 sm:w-auto')}
					aria-label={`Ingredient ${position} amount`}
					inputMode="decimal"
					autoComplete="off"
					disabled={toTaste}
					placeholder={toTaste ? '—' : undefined}
				/>
				<select
					{...fieldA11y(`${base}-unit`, rowErrors?.unit?.message)}
					{...unitField}
					onChange={(event) => {
						void unitField.onChange(event)
						if (event.target.value === TO_TASTE) setValue(`ingredients.${index}.amount`, '', { shouldDirty: true })
					}}
					className={cn(selectClass, 'min-w-28 flex-1 sm:min-w-0 sm:flex-none')}
					aria-label={`Ingredient ${position} unit`}
				>
					<option value="">Unit</option>
					{MEASUREMENT_UNITS.map((value) => <option key={value} value={value}>{value}</option>)}
					<option value={TO_TASTE}>to taste</option>
				</select>
				<RowControls noun="ingredient" position={position} count={count} onMove={onMove} onRemove={onRemove} className="ml-auto" />
			</div>
			{rowErrors?.name?.message && <FieldError id={`${base}-name-error`}>{rowErrors.name.message}</FieldError>}
			{rowErrors?.amount?.message && <FieldError id={`${base}-amount-error`}>{rowErrors.amount.message}</FieldError>}
			{rowErrors?.unit?.message && <FieldError id={`${base}-unit-error`}>{rowErrors.unit.message}</FieldError>}
		</li>
	)
}
