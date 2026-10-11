import type { CategoryWithUsage } from '@recipe-app/contracts/types'
import { categoryNameLength, normalizeCategoryName } from '@recipe-app/contracts/schemas'
import { Plus, Trash2 } from 'lucide-react'
import { useId, useRef } from 'react'
import { useFormContext, useFormState, useWatch, type UseFieldArrayReturn } from 'react-hook-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/features/recipes/form/components/form-field'
import { useRowFocus } from '@/features/recipes/form/hooks/use-row-focus'
import { fieldA11y, inputClass } from '@/features/recipes/form/lib/field-props'
import { cn } from '@/lib/utils'
import { emptyCategoryRow, recipeCountLabel, MAX_CATEGORIES, MAX_NAME_LENGTH, type CategoryFormValues } from '../lib/category-form'

type CategoryListProps = {
	/** The stored categories, for each row's recipe count and to tell a renamed row from an untouched one. */
	stored: CategoryWithUsage[]
	rows: UseFieldArrayReturn<CategoryFormValues, 'categories'>
	disabled: boolean
}

export function CategoryList({ stored, rows, disabled }: CategoryListProps) {
	const headingId = useId()
	const limitId = useId()
	const { listRef, focusRow } = useRowFocus<HTMLOListElement>()
	const addRef = useRef<HTMLButtonElement>(null)
	const count = rows.fields.length
	const full = count >= MAX_CATEGORIES

	function add() {
		focusRow({ index: count, controls: ['name'] })
		rows.append(emptyCategoryRow(), { shouldFocus: false })
	}

	function remove(index: number) {
		// Focus stays in the list: the row that takes this one's place, else the last row, else Add.
		if (count === 1) addRef.current?.focus()
		else focusRow({ index: Math.min(index, count - 2), controls: ['name'] })
		rows.remove(index)
	}

	return (
		<section aria-labelledby={headingId} className="max-w-xl">
			<Card className="sm:[--card-spacing:--spacing(5)]">
				<div className="flex items-baseline justify-between gap-2 px-(--card-spacing)">
					<h2 id={headingId} className="text-base font-semibold">Your categories</h2>
					<p className="text-sm text-muted-foreground tabular-nums">
						<span className="max-sm:sr-only">Up to {MAX_CATEGORIES} · </span>{count} of {MAX_CATEGORIES}
					</p>
				</div>
				<CardContent className="space-y-3">
					{count === 0 && <p className="text-sm text-muted-foreground">No categories yet. Add one to tag your recipes.</p>}
					<ol ref={listRef} className="space-y-3 empty:hidden">
						{rows.fields.map((field, index) => (
							<CategoryRow key={field.id} index={index} stored={stored} disabled={disabled} onRemove={() => remove(index)} />
						))}
					</ol>
					{/* Disabled rather than hidden at the limit, with the reason beside it. */}
					<Button ref={addRef} type="button" variant="outline" className="h-11 w-full border-dashed" disabled={full || disabled} aria-describedby={full ? limitId : undefined} onClick={add}>
						<Plus aria-hidden="true" /> Add category
					</Button>
					{full && <p id={limitId} className="text-sm text-muted-foreground">You’ve reached {MAX_CATEGORIES} categories. Remove one to add another.</p>}
				</CardContent>
			</Card>
		</section>
	)
}

type CategoryRowProps = { index: number; stored: CategoryWithUsage[]; disabled: boolean; onRemove: () => void }

function CategoryRow({ index, stored, disabled, onRemove }: CategoryRowProps) {
	const { register, control } = useFormContext<CategoryFormValues>()
	const { errors } = useFormState({ control, name: `categories.${index}.name` })
	const row = useWatch({ control, name: `categories.${index}` })
	const error = errors.categories?.[index]?.name?.message
	const base = `category-${index}`
	const label = normalizeCategoryName(row.name) || `category ${index + 1}`
	const saved = stored.find(({ id }) => id === row.categoryId)

	return (
		<li className="space-y-1.5">
			<div className="flex items-center gap-2">
				<div className="relative min-w-0 flex-1">
					<Input
						{...fieldA11y(`${base}-name`, error)}
						{...register(`categories.${index}.name`)}
						className={cn(inputClass, 'sm:pr-14')}
						aria-label={`Category ${index + 1} name`}
						data-control="name"
						autoComplete="off"
						enterKeyHint="done"
					/>
					<span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 text-xs text-muted-foreground tabular-nums sm:block">
						{categoryNameLength(row.name)}/{MAX_NAME_LENGTH}
					</span>
				</div>
				<UsagePill saved={saved} renamed={saved !== undefined && normalizeCategoryName(row.name) !== saved.name} />
				<Button type="button" variant="outline" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label={`Remove ${label}`} disabled={disabled} onClick={onRemove}>
					<Trash2 aria-hidden="true" />
				</Button>
			</div>
			{error && <FieldError id={`${base}-name-error`}>{error}</FieldError>}
		</li>
	)
}

/** How many recipes carry the category, which is what removing it would untag. Narrow screens show the number alone. */
function UsagePill({ saved, renamed }: { saved: CategoryWithUsage | undefined; renamed: boolean }) {
	if (!saved) return <Badge variant="secondary" className="h-6 shrink-0">New</Badge>
	return (
		<Badge variant="secondary" className="h-6 min-w-6 shrink-0 tabular-nums">
			<span className="sm:hidden" aria-hidden="true">{saved.recipeCount}</span>
			<span className="max-sm:sr-only">{recipeCountLabel(saved.recipeCount)}{renamed && ' · renamed'}</span>
		</Badge>
	)
}
