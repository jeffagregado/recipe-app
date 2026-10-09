import { RECIPE_CATEGORIES, RECIPE_LIMITS, type RecipeCategory } from '@recipe-app/contracts/types'
import { Check } from 'lucide-react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import type { RecipeFormValues } from '../_lib/recipe-form-schema'
import { FieldError } from './form-field'

export function CategoryChips() {
	const { control, setValue, formState: { errors } } = useFormContext<RecipeFormValues>()
	const selected = useWatch({ control, name: 'categories' })
	const full = selected.length >= RECIPE_LIMITS.categories
	const error = errors.categories?.message ?? errors.categories?.root?.message

	// Selection order is the stored order, so a new choice is appended and a removed one is dropped.
	function toggle(category: RecipeCategory) {
		const next = selected.includes(category) ? selected.filter((value) => value !== category) : [...selected, category]
		setValue('categories', next, { shouldDirty: true, shouldTouch: true })
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
				{RECIPE_CATEGORIES.map((category) => {
					const pressed = selected.includes(category)
					return (
						<Button
							key={category}
							type="button"
							variant="outline"
							className="h-11 rounded-full px-4 aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
							aria-pressed={pressed}
							disabled={!pressed && full}
							onClick={() => toggle(category)}
						>
							{pressed && <Check aria-hidden="true" />}
							{category}
						</Button>
					)
				})}
			</div>
			{error && <FieldError id="recipe-category-error">{error}</FieldError>}
		</div>
	)
}
