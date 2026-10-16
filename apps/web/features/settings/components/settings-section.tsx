import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SettingsSectionProps = {
	headingId: string
	title: string
	description: ReactNode
	/** Hides the description below `lg` when it names something only the desktop layout shows. */
	descriptionClassName?: string
	children: ReactNode
}

/** One setting: heading and description on the left, the form on the right from `md`; stacked below it. Rows are separated by a rule, not boxed. */
export function SettingsSection({ headingId, title, description, descriptionClassName, children }: SettingsSectionProps) {
	return (
		<section aria-labelledby={headingId} className="grid gap-4 border-t border-border py-8 first:border-t-0 first:pt-0 md:grid-cols-3 md:gap-8">
			<div className="space-y-1">
				<h2 id={headingId} className="text-xl font-semibold tracking-tight">{title}</h2>
				<p className={cn('text-sm leading-relaxed text-muted-foreground', descriptionClassName)}>{description}</p>
			</div>
			<div className="min-w-0 md:col-span-2 md:max-w-xl">{children}</div>
		</section>
	)
}
