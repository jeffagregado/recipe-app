import type { ChangeEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { IMAGE_ACCEPT } from '../lib/recipe-files'
import type { FieldA11yProps } from '../lib/field-props'

type PhotoPickerProps = {
	label: string
	onPick: (file: File) => void
	disabled?: boolean
	a11y?: Partial<FieldA11yProps>
	className?: string
	children: ReactNode
}

/**
 * A transparent file input laid over its visual: click, tap, keyboard and desktop drag-and-drop all work natively,
 * so no drag handlers are needed.
 */
export function PhotoPicker({ label, onPick, disabled, a11y, className, children }: PhotoPickerProps) {
	function handleChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]
		// Clearing the value lets the same file be chosen again after a Remove.
		event.target.value = ''
		if (file) onPick(file)
	}

	return (
		<div className={cn('relative has-focus-visible:ring-3 has-focus-visible:ring-ring/50', className)}>
			{children}
			<input
				type="file"
				accept={IMAGE_ACCEPT}
				aria-label={label}
				title=""
				disabled={disabled}
				onChange={handleChange}
				className="absolute inset-0 size-full cursor-pointer scroll-mt-24 opacity-0 disabled:cursor-not-allowed"
				{...a11y}
			/>
		</div>
	)
}
