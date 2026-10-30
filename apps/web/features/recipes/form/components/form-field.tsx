import { CircleAlert, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { fieldA11y, type FieldA11yProps } from '../lib/field-props'

export function FieldError({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
	return (
		<p id={id} className={cn('flex items-start gap-1.5 text-sm text-destructive wrap-break-word', className)}>
			<CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
			<span>{children}</span>
		</p>
	)
}

/** Announces work in progress on a field, laid out like its error. */
export function FieldStatus({ children }: { children: ReactNode }) {
	return (
		<p role="status" className="flex items-start gap-1.5 text-sm text-muted-foreground">
			<Loader2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" />
			<span>{children}</span>
		</p>
	)
}

export function OptionalBadge() {
	return <Badge variant="secondary">Optional</Badge>
}

type FormFieldProps = {
	id: string
	label: ReactNode
	required?: boolean
	optional?: boolean
	hint?: string
	error?: string
	className?: string
	children: (props: FieldA11yProps) => ReactNode
}

export function FormField({ id, label, required, optional, hint, error, className, children }: FormFieldProps) {
	return (
		<div className={cn('space-y-1.5', className)}>
			<div className="flex items-center gap-2">
				<label htmlFor={id} className="text-sm font-medium">{label}</label>
				{required && <span aria-hidden="true" className="text-destructive">*</span>}
				{optional && <OptionalBadge />}
			</div>
			{children(fieldA11y(id, error, Boolean(hint)))}
			{hint && <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p>}
			{error && <FieldError id={`${id}-error`}>{error}</FieldError>}
		</div>
	)
}
