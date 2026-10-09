import { StickyNote } from 'lucide-react'
import { useFormContext } from 'react-hook-form'
import type { RecipeFormValues } from '../_lib/recipe-form-schema'
import { textareaClass } from '../_lib/field-props'
import { FormField } from './form-field'
import { SectionCard } from './section-card'

export function NotesSection() {
	const { register, formState: { errors } } = useFormContext<RecipeFormValues>()

	return (
		<SectionCard icon={StickyNote} title="Notes" optional>
			<FormField id="recipe-notes" label={<span className="sr-only">Notes</span>} hint="Shown on the recipe page only when filled in." error={errors.notes?.message}>
				{(a11y) => <textarea {...a11y} {...register('notes')} className={textareaClass} rows={3} placeholder="Tips, substitutions, storage…" />}
			</FormField>
		</SectionCard>
	)
}
