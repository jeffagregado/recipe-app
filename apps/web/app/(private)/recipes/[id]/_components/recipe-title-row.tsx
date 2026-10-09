import type { ReactNode } from 'react'

type RecipeTitleRowProps = {
	title: string
	/** Right side of the row: the favorite heart and the ⋮ menu. */
	actions?: ReactNode
}

export function RecipeTitleRow({ title, actions }: RecipeTitleRowProps) {
	return (
		<div className="flex items-start justify-between gap-3">
			<h1 className="min-w-0 flex-1 text-2xl font-bold wrap-break-word sm:text-3xl lg:text-4xl">{title}</h1>
			{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
		</div>
	)
}
