import { MEASUREMENT_UNITS } from '@recipe-app/contracts/types'
import { ClipboardList } from 'lucide-react'
import { useController, useFormContext, useFormState, type FieldErrors } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { emptyIngredientRow, MAX_ROWS, TO_TASTE, type RecipeFormValues } from '../lib/recipe-form-schema'
import { fieldA11y, inputClass } from '../lib/field-props'
import { FieldError } from './form-field'
import { RowControls } from './row-controls'
import { SectionCard } from './section-card'
import { useRowGroups } from '../hooks/use-row-groups'
import { AddHeadingLink, AddRowControls, GroupHeading } from './row-group'

type RowPlace = { group: number; row: number; position: number }
type IngredientRowProps = RowPlace & { canMove: (direction: 'up' | 'down') => boolean; onMove: (direction: 'up' | 'down') => void; onRemove: () => void }

const ROW_GRID = 'sm:grid sm:grid-cols-[minmax(0,1fr)_5.5rem_8.5rem_auto] sm:items-center sm:gap-2'

export function IngredientsSection() {
	const { control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const { containerRef, ...rows } = useRowGroups({ name: 'ingredients', key: 'rows', empty: emptyIngredientRow, control: 'name' })
	const listError = errors.ingredients?.message ?? errors.ingredients?.root?.message
	const atLimit = rows.total >= MAX_ROWS.ingredients

	return (
		<SectionCard icon={ClipboardList} title="Ingredients" required>
			<div aria-hidden="true" className={cn('hidden px-0.5 text-xs text-muted-foreground', ROW_GRID)}>
				<span>Ingredient</span>
				<span>Amount</span>
				<span>Unit</span>
				<span className="w-33" />
			</div>
			<div ref={containerRef} className="space-y-5">
				{rows.groups.map((field, group) => (
					<div key={field.id} data-group={group} className={cn('space-y-4 sm:space-y-3', group > 0 && 'border-t border-border pt-5')}>
						{/* Only the first group can be untitled; then it offers "Add heading". */}
						{field.heading === null ? (
							<AddHeadingLink onClick={rows.nameFirstGroup} />
						) : (
							<GroupHeading
								list="ingredients"
								group={group}
								placeholder="Group name, such as Sauces"
								canMove={(direction) => rows.canMoveGroup(group, direction)}
								onMove={(direction) => rows.moveGroup(group, direction)}
								onRemoveHeading={() => rows.removeHeading(group)}
							/>
						)}
						<ol className="space-y-4 sm:space-y-3">
							{field.rows.map((_, row) => (
								<IngredientRow
									key={`${field.id}-${row}`}
									group={group}
									row={row}
									position={rows.startOf(group) + row + 1}
									canMove={(direction) => rows.canMoveRow(group, row, direction)}
									onMove={(direction) => rows.moveRow(group, row, direction)}
									onRemove={() => rows.removeRow(group, row)}
								/>
							))}
						</ol>
						<AddRowControls
							addLabel="Add ingredient"
							limitText={`You’ve reached the limit of ${MAX_ROWS.ingredients} ingredients.`}
							atLimit={atLimit}
							onAdd={() => rows.addRow(group)}
							onAddGroup={group === rows.groups.length - 1 ? rows.addGroup : undefined}
						/>
					</div>
				))}
			</div>
			{listError && <FieldError id="recipe-ingredients-error">{listError}</FieldError>}
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

function ingredientRowErrors(errors: FieldErrors<RecipeFormValues>, group: number, index: number): RowErrors {
	const row = errors.ingredients?.[group]?.rows?.[index]
	return { name: row?.name?.message, amount: row?.amount?.message, unit: row?.unit?.message }
}

function RowFieldErrors({ base, errors }: { base: string; errors: RowErrors }) {
	return (['name', 'amount', 'unit'] as const).map((key) => errors[key] && <FieldError key={key} id={`${base}-${key}-error`}>{errors[key]}</FieldError>)
}

function IngredientRow({ group, row, position, canMove, onMove, onRemove }: IngredientRowProps) {
	const { register, setValue, control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const { field: { value: unit, onChange: changeUnit, onBlur: blurUnit, ref: unitRef } } = useController({ control, name: `ingredients.${group}.rows.${row}.unit` })
	const rowErrors = ingredientRowErrors(errors, group, row)
	const path = `ingredients.${group}.rows.${row}` as const
	const base = `recipe-ingredient-${position - 1}`
	const toTaste = unit === TO_TASTE

	return (
		<li className="space-y-1.5" data-row={position - 1}>
			<div className={cn('flex flex-wrap items-center gap-2', ROW_GRID)}>
				<Input
					{...fieldA11y(`${base}-name`, rowErrors.name)}
					{...register(`${path}.name`)}
					className={cn(inputClass, 'basis-full sm:basis-auto')}
					aria-label={`Ingredient ${position} name`}
					data-control="name"
					autoComplete="off"
				/>
				<Input
					{...fieldA11y(`${base}-amount`, rowErrors.amount)}
					{...register(`${path}.amount`)}
					className={cn(inputClass, 'w-16 sm:w-auto')}
					aria-label={`Ingredient ${position} amount`}
					autoComplete="off"
					disabled={toTaste}
					placeholder={toTaste ? '-' : undefined}
				/>
				<Select
					items={UNIT_ITEMS}
					value={unit || null}
					onValueChange={(value) => {
						changeUnit(value ?? '')
						if (value === TO_TASTE) setValue(`${path}.amount`, '', { shouldDirty: true })
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
				<RowControls noun="ingredient" position={position} canMove={canMove} onMove={onMove} onRemove={onRemove} className="ml-auto" />
			</div>
			<RowFieldErrors base={base} errors={rowErrors} />
		</li>
	)
}
