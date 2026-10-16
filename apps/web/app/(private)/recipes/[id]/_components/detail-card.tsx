import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type DetailCardProps = {
	icon: LucideIcon
	title: string
	/** Sits right of the title when the section is wide enough and drops under it when it is narrow. */
	action?: ReactNode
	/** `panel` is the one raised, tinted surface (Ingredients, Video); `plain` runs on the page (Instructions). */
	variant?: 'panel' | 'plain'
	children: ReactNode
}

/** A recipe page section: icon + heading, optional header action, content. A container, so the header can react to its own width. */
export function DetailCard({ icon: Icon, title, action, variant = 'panel', children }: DetailCardProps) {
	const headingId = useId()

	return (
		<section aria-labelledby={headingId} className={cn('@container flex flex-col gap-4', variant === 'panel' && 'rounded-2xl bg-accent/50 p-4 sm:p-5')}>
			<div className="flex flex-col gap-3 @min-[24rem]:flex-row @min-[24rem]:items-center @min-[24rem]:justify-between">
				<h2 id={headingId} className="flex items-center gap-2 text-xl font-semibold tracking-tight">
					<Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
					{title}
				</h2>
				{action}
			</div>
			<div>{children}</div>
		</section>
	)
}
