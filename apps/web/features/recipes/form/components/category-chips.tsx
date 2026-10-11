import { RECIPE_LIMITS, type Category } from '@recipe-app/contracts/types'
import { Check } from 'lucide-react'
import Link from 'next/link'
import { useFormContext, useWatch, useFormState } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import type { RecipeFormValues } from '../lib/recipe-form-schema'
import { FieldError } from './form-field'

/** The user's own categories as toggle chips; the form stores the chosen ids. */
export function CategoryChips({ categories }: { categories: Category[] }) {
	const { control, setValue } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const selected = useWatch({ control, name: 'categories' })
	const full = selected.length >= RECIPE_LIMITS.categories
	const error = errors.categories?.message ?? errors.categories?.root?.message

	// Selection order is the stored order, so a new choice is appended and a removed one is dropped.
	function toggle(id: string) {
		const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]
		setValue('categories', next, { shouldDirty: true, shouldTouch: true })
	}

	if (categories.length === 0) {
		return (
			<div className="space-y-2">
				<span className="text-sm font-medium">Category</span>
				<p className="text-sm text-muted-foreground">
					No categories yet. Add some in{' '}
					<Link href="/categories" className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4">Categories</Link>
				</p>
				{error && <FieldError id="recipe-category-error">{error}</FieldError>}
			</div>
		)
	}

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-baseline justify-between gap-x-3">
				<span id="recipe-category-label" className="text-sm font-medium">Category</span>
				<span id="recipe-category-hint" className="text-sm text-muted-foreground">
					Choose up to {RECIPE_LIMITS.categories} · {selected.length} selected
				</span>
			</div>
			<div role="group" aria-labelledby="recipe-category-label" aria-describedby={error ? 'recipe-category-error' : 'recipe-category-hint'} className="flex flex-wrap gap-2">
				{categories.map(({ id, name }) => {
					const pressed = selected.includes(id)
					return (
						<Button
							key={id}
							type="button"
							variant="outline"
							className="h-11 rounded-full px-4 aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
							aria-pressed={pressed}
							disabled={!pressed && full}
							onClick={() => toggle(id)}
						>
							{pressed && <Check aria-hidden="true" />}
							{name}
						</Button>
					)
				})}
			</div>
			{error && <FieldError id="recipe-category-error">{error}</FieldError>}
		</div>
	)
}
