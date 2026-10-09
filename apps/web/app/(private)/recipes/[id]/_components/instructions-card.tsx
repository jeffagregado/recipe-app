import type { RecipeDetail } from '@recipe-app/contracts/types'
import { ListOrdered } from 'lucide-react'
import { DetailCard } from './detail-card'
import { StepPhoto } from './step-photo'

type InstructionsCardProps = {
	instructions: RecipeDetail['instructions']
}

/** Numbered steps; a step photo sits right of its text on wider layouts and under it on mobile. */
export function InstructionsCard({ instructions }: InstructionsCardProps) {
	return (
		<DetailCard icon={ListOrdered} title="Instructions">
			<ol aria-label="Instructions" className="divide-y divide-border">
				{instructions.map((step) => (
					<li key={step.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
						<span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
							{step.stepNumber}
						</span>
						<div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
							<p className="min-w-0 flex-1 pt-1 whitespace-pre-line wrap-break-word">{step.description}</p>
							{step.imageUrl && <StepPhoto src={step.imageUrl} stepNumber={step.stepNumber} />}
						</div>
					</li>
				))}
			</ol>
		</DetailCard>
	)
}
