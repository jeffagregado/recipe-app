import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

type DetailCardProps = {
	icon: LucideIcon
	title: string
	/** Sits right of the title when the card is wide enough and drops under it when the card is narrow. */
	action?: ReactNode
	children: ReactNode
}

/** A recipe page section: icon + heading, optional header action, content. The card is a container so the header can react to its own width. */
export function DetailCard({ icon: Icon, title, action, children }: DetailCardProps) {
	const headingId = useId()

	return (
		<section aria-labelledby={headingId}>
			<Card className="@container sm:[--card-spacing:--spacing(5)]">
				<div className="flex flex-col gap-3 px-(--card-spacing) @min-[24rem]:flex-row @min-[24rem]:items-center @min-[24rem]:justify-between">
					<h2 id={headingId} className="flex items-center gap-2 text-base font-semibold">
						<Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
						{title}
					</h2>
					{action}
				</div>
				<CardContent>{children}</CardContent>
			</Card>
		</section>
	)
}
