import { useId, type ReactNode } from 'react'

type ListLabelProps = { 'aria-label'?: string; 'aria-labelledby'?: string }

type GroupListProps = {
	heading: string | null
	/** Accessible name of the untitled group's list. */
	label: string
	children: (labelProps: ListLabelProps) => ReactNode
}

/** One group of a recipe list: a named group's `h3` names its list, and the untitled first group keeps the section's name. */
export function GroupList({ heading, label, children }: GroupListProps) {
	const headingId = useId()
	if (heading === null) return children({ 'aria-label': label })
	return (
		<div className="flex flex-col gap-1">
			<h3 id={headingId} className="text-sm font-semibold tracking-wide text-foreground uppercase wrap-break-word">{heading}</h3>
			{children({ 'aria-labelledby': headingId })}
		</div>
	)
}
