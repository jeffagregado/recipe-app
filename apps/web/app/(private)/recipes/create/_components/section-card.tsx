import type { LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { OptionalBadge } from './form-field'

type SectionCardProps = {
	icon: LucideIcon
	title: string
	required?: boolean
	optional?: boolean
	children: ReactNode
}

export function SectionCard({ icon: Icon, title, required, optional, children }: SectionCardProps) {
	const headingId = useId()
	return (
		<section aria-labelledby={headingId}>
			<Card className="sm:[--card-spacing:--spacing(5)]">
				<div className="flex items-center justify-between gap-2 px-(--card-spacing)">
					<h2 id={headingId} className="flex items-center gap-2 text-base font-semibold">
						<Icon aria-hidden="true" className="size-4 text-muted-foreground" />
						{title}
						{required && (
							<>
								<span aria-hidden="true" className="text-destructive">*</span>
								<span className="sr-only">(required)</span>
							</>
						)}
					</h2>
					{optional && <OptionalBadge />}
				</div>
				<CardContent className="space-y-4">{children}</CardContent>
			</Card>
		</section>
	)
}
