import type { RecipeDetail } from '@recipe-app/contracts/types'
import { ListOrdered } from 'lucide-react'
import { DetailCard } from './detail-card'
import { StepPhoto } from './step-photo'

type InstructionsCardProps = {
	instructions: RecipeDetail['instructions']
}

/** Numbered steps on the page itself; a step photo sits right of its text on wider layouts and under it on mobile. */
export function InstructionsCard({ instructions }: InstructionsCardProps) {
	return (
		<DetailCard icon={ListOrdered} title="Instructions" variant="plain">
			<ol aria-label="Instructions" className="flex flex-col gap-8">
				{instructions.map((step) => (
					<li key={step.id} className="flex gap-4 sm:gap-5">
						<span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground tabular-nums">
							{step.stepNumber}
						</span>
						<div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
							<p className="min-w-0 flex-1 pt-1.5 text-base leading-relaxed whitespace-pre-line wrap-break-word sm:text-lg">{step.description}</p>
							{step.imageUrl && <StepPhoto src={step.imageUrl} stepNumber={step.stepNumber} />}
						</div>
					</li>
				))}
			</ol>
		</DetailCard>
	)
}
