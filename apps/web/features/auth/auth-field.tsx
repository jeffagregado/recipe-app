import type { ComponentProps, ReactNode } from 'react'
import { Input } from '@/components/ui/input'

type AuthFieldProps = ComponentProps<typeof Input> & {
	id: string
	label: string
	error?: string
	guidance?: string
	children?: ReactNode
}

export function AuthField({ id, label, error, guidance, children, ...props }: AuthFieldProps) {
	const description = [guidance ? `${id}-guidance` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
	return <div className="space-y-2">
		<label htmlFor={id} className="block text-sm font-medium">{label}</label>
		<div className="relative">
			<Input id={id} aria-invalid={Boolean(error)} aria-describedby={description} {...props} />
			{children}
		</div>
		{guidance && <p id={`${id}-guidance`} className="text-sm text-muted-foreground">{guidance}</p>}
		{error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
	</div>
}
