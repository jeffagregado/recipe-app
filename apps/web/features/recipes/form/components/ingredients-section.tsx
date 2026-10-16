import { MEASUREMENT_UNITS } from '@recipe-app/contracts/types'
import { ClipboardList, Plus } from 'lucide-react'
import { useController, useFieldArray, useFormContext, useFormState, type FieldErrors } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { emptyIngredientRow, MAX_ROWS, TO_TASTE, type RecipeFormValues } from '../lib/recipe-form-schema'
import { fieldA11y, inputClass } from '../lib/field-props'
import { FieldError } from './form-field'
import { RowControls } from './row-controls'
import { SectionCard } from './section-card'
import { useRowActions } from '../hooks/use-row-actions'

type IngredientRowProps = { index: number; count: number; onMove: (direction: 'up' | 'down') => void; onRemove: () => void }

const ROW_GRID = 'sm:grid sm:grid-cols-[minmax(0,1fr)_5.5rem_8.5rem_auto] sm:items-center sm:gap-2'

export function IngredientsSection() {
	const { control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const { fields, append, remove, move, update } = useFieldArray({ control, name: 'ingredients' })
	const { listRef, focusNewRow, moveRow, removeRow } = useRowActions<HTMLOListElement>({
		count: fields.length, control: 'name', move, remove, clear: () => update(0, emptyIngredientRow()),
	})
	const listError = errors.ingredients?.message ?? errors.ingredients?.root?.message

	function add() {
		focusNewRow()
		append(emptyIngredientRow(), { shouldFocus: false })
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

/** A null value is the "no unit" choice; the trigger then shows the placeholder. */
const UNIT_ITEMS = [
	{ value: null, label: 'Unit' },
	...MEASUREMENT_UNITS.map((value) => ({ value, label: value })),
	{ value: TO_TASTE, label: 'to taste' },
]

type RowErrors = Partial<Record<'name' | 'amount' | 'unit', string>>

function ingredientRowErrors(errors: FieldErrors<RecipeFormValues>, index: number): RowErrors {
	const row = errors.ingredients?.[index]
	return { name: row?.name?.message, amount: row?.amount?.message, unit: row?.unit?.message }
}

function RowFieldErrors({ base, errors }: { base: string; errors: RowErrors }) {
	return (['name', 'amount', 'unit'] as const).map((key) => errors[key] && <FieldError key={key} id={`${base}-${key}-error`}>{errors[key]}</FieldError>)
}

function IngredientRow({ index, count, onMove, onRemove }: IngredientRowProps) {
	const { register, setValue, control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const { field: { value: unit, onChange: changeUnit, onBlur: blurUnit, ref: unitRef } } = useController({ control, name: `ingredients.${index}.unit` })
	const rowErrors = ingredientRowErrors(errors, index)
	const position = index + 1
	const base = `recipe-ingredient-${index}`
	const toTaste = unit === TO_TASTE

	return (
		<li className="space-y-1.5">
			<div className={cn('flex flex-wrap items-center gap-2', ROW_GRID)}>
				<Input
					{...fieldA11y(`${base}-name`, rowErrors.name)}
					{...register(`ingredients.${index}.name`)}
					className={cn(inputClass, 'basis-full sm:basis-auto')}
					aria-label={`Ingredient ${position} name`}
					data-control="name"
					autoComplete="off"
				/>
				<Input
					{...fieldA11y(`${base}-amount`, rowErrors.amount)}
					{...register(`ingredients.${index}.amount`)}
					className={cn(inputClass, 'w-16 sm:w-auto')}
					aria-label={`Ingredient ${position} amount`}
					inputMode="decimal"
					autoComplete="off"
					disabled={toTaste}
					placeholder={toTaste ? '-' : undefined}
				/>
				<Select
					items={UNIT_ITEMS}
					value={unit || null}
					onValueChange={(value) => {
						changeUnit(value ?? '')
						if (value === TO_TASTE) setValue(`ingredients.${index}.amount`, '', { shouldDirty: true })
					}}
				>
					<SelectTrigger
						{...fieldA11y(`${base}-unit`, rowErrors.unit)}
						ref={unitRef}
						onBlur={blurUnit}
						aria-label={`Ingredient ${position} unit`}
						className="h-11 min-w-20 flex-1 scroll-mt-24 text-base data-[size=default]:h-11 sm:w-full sm:min-w-0 sm:flex-none"
					>
						<SelectValue placeholder="Unit" />
					</SelectTrigger>
					<SelectContent>
						{UNIT_ITEMS.map(({ value, label }) => <SelectItem key={label} value={value} className="min-h-9 text-base">{label}</SelectItem>)}
					</SelectContent>
				</Select>
				<RowControls noun="ingredient" position={position} count={count} onMove={onMove} onRemove={onRemove} className="ml-auto" />
			</div>
			<RowFieldErrors base={base} errors={rowErrors} />
		</li>
	)
}
