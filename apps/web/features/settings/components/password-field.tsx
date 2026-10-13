import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@recipe-app/contracts/types'
import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/features/recipes/form/components/form-field'
import { fieldA11y, inputClass } from '@/features/recipes/form/lib/field-props'
import { cn } from '@/lib/utils'

type PasswordFieldProps = ComponentProps<typeof Input> & {
	id: string
	label: string
	error?: string
	/** Shows the allowed length inside the field, and says it to assistive technology. */
	range?: boolean
}

/** A labelled, masked field with its error below it, shared by the Settings cards that ask for a password. */
export function PasswordField({ id, label, error, range, ...props }: PasswordFieldProps) {
	return (
		<div className="space-y-1.5">
			<label htmlFor={id} className="text-sm font-medium">{label}</label>
			<div className="relative">
				<Input {...fieldA11y(id, error, range)} {...props} type="password" className={cn(inputClass, range && 'pr-20')} />
				{range && (
					<span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground tabular-nums">
						{PASSWORD_MIN_LENGTH}–{PASSWORD_MAX_LENGTH}
					</span>
				)}
			</div>
			{range && <p id={`${id}-hint`} className="sr-only">{PASSWORD_MIN_LENGTH} to {PASSWORD_MAX_LENGTH} characters</p>}
			{error && <FieldError id={`${id}-error`}>{error}</FieldError>}
		</div>
	)
}
