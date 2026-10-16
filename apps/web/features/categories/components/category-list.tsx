import type { CategoryWithUsage } from '@recipe-app/contracts/types'
import { categoryNameLength, normalizeCategoryName } from '@recipe-app/contracts/schemas'
import { Plus, Trash2 } from 'lucide-react'
import { useId, useRef } from 'react'
import { useFormContext, useFormState, useWatch, type UseFieldArrayReturn } from 'react-hook-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/features/recipes/form/components/form-field'
import { useRowFocus } from '@/features/recipes/form/hooks/use-row-focus'
import { fieldA11y, inputClass } from '@/features/recipes/form/lib/field-props'
import { cn } from '@/lib/utils'
import { emptyCategoryRow, recipeCountLabel, MAX_CATEGORIES, MAX_NAME_LENGTH, type CategoryFormValues } from '../lib/category-form'

type CategoryListProps = {
	/** The stored categories, for each tile's recipe count and to tell a renamed one from an untouched one. */
	stored: CategoryWithUsage[]
	rows: UseFieldArrayReturn<CategoryFormValues, 'categories'>
	disabled: boolean
}

/** One tile per category, two across from `md`, with Add category as the last tile. */
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
		// Focus stays in the list: the tile that takes this one's place, else the last tile, else Add.
		if (count === 1) addRef.current?.focus()
		else focusRow({ index: Math.min(index, count - 2), controls: ['name'] })
		rows.remove(index)
	}

	return (
		<section aria-labelledby={headingId} className="space-y-4">
			<div className="flex items-baseline justify-between gap-2">
				<h2 id={headingId} className="text-xl font-semibold tracking-tight">Your categories</h2>
				<p className="text-sm text-muted-foreground tabular-nums">
					<span className="max-sm:sr-only">Up to {MAX_CATEGORIES} · </span>{count} of {MAX_CATEGORIES}
				</p>
			</div>
			{count === 0 && <p className="text-sm text-muted-foreground">No categories yet. Add one to tag your recipes.</p>}
			<div className="grid gap-4 md:grid-cols-2">
				{/* `contents` lets the tiles and the Add tile share one grid while the list stays a list. */}
				<ol ref={listRef} className="contents">
					{rows.fields.map((field, index) => (
						<CategoryTile key={field.id} index={index} stored={stored} disabled={disabled} onRemove={() => remove(index)} />
					))}
				</ol>
				{/* Disabled rather than hidden at the limit, with the reason beside it. */}
				<Button ref={addRef} type="button" variant="outline" className="min-h-24 w-full rounded-2xl border-dashed text-base motion-safe:active:scale-[0.98]" disabled={full || disabled} aria-describedby={full ? limitId : undefined} onClick={add}>
					<Plus aria-hidden="true" /> Add category
				</Button>
			</div>
			{full && <p id={limitId} className="text-sm text-muted-foreground">You’ve reached {MAX_CATEGORIES} categories. Remove one to add another.</p>}
		</section>
	)
}

type CategoryTileProps = { index: number; stored: CategoryWithUsage[]; disabled: boolean; onRemove: () => void }

function CategoryTile({ index, stored, disabled, onRemove }: CategoryTileProps) {
	const { register, control } = useFormContext<CategoryFormValues>()
	const { errors } = useFormState({ control, name: `categories.${index}.name` })
	const row = useWatch({ control, name: `categories.${index}` })
	const error = errors.categories?.[index]?.name?.message
	const base = `category-${index}`
	const label = normalizeCategoryName(row.name) || `category ${index + 1}`
	const saved = stored.find(({ id }) => id === row.categoryId)

	return (
		<li className="flex flex-col gap-3 rounded-2xl bg-accent/50 p-4">
			<div className="flex items-center gap-2">
				<div className="relative min-w-0 flex-1">
					<Input
						{...fieldA11y(`${base}-name`, error)}
						{...register(`categories.${index}.name`)}
						className={cn(inputClass, 'bg-background sm:pr-14')}
						aria-label={`Category ${index + 1} name`}
						data-control="name"
						autoComplete="off"
						enterKeyHint="done"
					/>
					<span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 text-xs text-muted-foreground tabular-nums sm:block">
						{categoryNameLength(row.name)}/{MAX_NAME_LENGTH}
					</span>
				</div>
				<Button type="button" variant="outline" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label={`Remove ${label}`} disabled={disabled} onClick={onRemove}>
					<Trash2 aria-hidden="true" />
				</Button>
			</div>
			<div className="flex items-center justify-between gap-2">
				<UsagePill saved={saved} renamed={saved !== undefined && normalizeCategoryName(row.name) !== saved.name} />
			</div>
			{error && <FieldError id={`${base}-name-error`}>{error}</FieldError>}
		</li>
	)
}

/** How many recipes carry the category, which is what removing it would untag. */
function UsagePill({ saved, renamed }: { saved: CategoryWithUsage | undefined; renamed: boolean }) {
	if (!saved) return <Badge variant="secondary" className="h-6 shrink-0">New</Badge>
	return (
		<Badge variant="secondary" className="h-6 min-w-6 shrink-0 tabular-nums">
			{recipeCountLabel(saved.recipeCount)}{renamed && ' · renamed'}
		</Badge>
	)
}
