import type { Category } from '@recipe-app/contracts/types'
import { FileText, Link2 } from 'lucide-react'
import { useFormContext, useFormState } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { RecipeFormValues } from '../lib/recipe-form-schema'
import { CategoryChips } from './category-chips'
import { inputClass, textareaClass } from '../lib/field-props'
import { FormField, OptionalBadge } from './form-field'
import { SectionCard } from './section-card'

type TimeFieldProps = { id: string; name: 'prepTime' | 'cookTime' | 'servings'; label: string; suffix?: string; error?: string }

export function BasicInformationSection({ categories }: { categories: Category[] }) {
	const { register, control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })

	return (
		<SectionCard icon={FileText} title="Basic Information">
			<FormField id="recipe-title" label="Title" required error={errors.title?.message}>
				{(a11y) => <Input {...a11y} {...register('title')} className={inputClass} placeholder="e.g. Creamy Garlic Pasta" autoComplete="off" aria-required="true" />}
			</FormField>

			<FormField id="recipe-description" label="Description" error={errors.description?.message}>
				{(a11y) => <textarea {...a11y} {...register('description')} className={textareaClass} rows={3} placeholder="Write a short description…" />}
			</FormField>

			<CategoryChips categories={categories} />

			<fieldset className="min-w-0 space-y-1.5">
				<legend className="mb-1.5 flex items-center gap-2 text-sm font-medium">
					Time &amp; servings
					<OptionalBadge />
				</legend>
				<div className="grid grid-cols-2 gap-3 min-[24rem]:grid-cols-3">
					<TimeField id="recipe-prep-time" name="prepTime" label="Prep time" suffix="min" error={errors.prepTime?.message} />
					<TimeField id="recipe-cook-time" name="cookTime" label="Cook time" suffix="min" error={errors.cookTime?.message} />
					<TimeField id="recipe-servings" name="servings" label="Servings" error={errors.servings?.message} />
				</div>
			</fieldset>

			<FormField id="recipe-video-url" label="Video link" optional error={errors.videoUrl?.message}>
				{(a11y) => (
					<div className="relative">
						<Link2 aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input {...a11y} {...register('videoUrl')} className={cn(inputClass, 'pl-9')} type="url" inputMode="url" autoComplete="off" placeholder="Paste one video link" />
					</div>
				)}
			</FormField>
		</SectionCard>
	)
}

/** Blank means "not set" (null), never zero. */
function TimeField({ id, name, label, suffix, error }: TimeFieldProps) {
	const { register } = useFormContext<RecipeFormValues>()
	return (
		<FormField id={id} label={suffix ? <>{label}<span className="sr-only"> in minutes</span></> : label} error={error} className="min-w-0">
			{(a11y) => (
				<div className="flex">
					<Input {...a11y} {...register(name)} className={cn(inputClass, 'min-w-0', suffix && 'rounded-r-none')} inputMode="numeric" autoComplete="off" />
					{suffix && <span aria-hidden="true" className="grid min-w-10 place-items-center rounded-r-lg border border-l-0 border-input bg-muted px-2 text-sm text-muted-foreground">{suffix}</span>}
				</div>
			)}
		</FormField>
	)
}
