'use client'

import type { RecipeDetail } from '@recipe-app/contracts/types'
import { ClipboardList } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { servingsLabel } from '../_lib/recipe-detail-format'
import { clampServings, MAX_SERVINGS, MIN_SERVINGS, scaledAmount } from '../_lib/scale-quantity'
import { DetailCard } from './detail-card'
import { ServingsStepper } from './servings-stepper'

type IngredientRow = Pick<RecipeDetail['ingredients'][number], 'id' | 'name' | 'quantity' | 'unit'>

type IngredientsCardProps = {
	ingredients: IngredientRow[]
	/** The recipe's own serving count; the scaler is hidden when it is null. */
	servings: number | null
}

/** Check-off and servings scaling are on-screen state for this visit only; nothing is saved. */
export function IngredientsCard({ ingredients, servings }: IngredientsCardProps) {
	const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
	const [chosen, setChosen] = useState(servings)
	const stepper = useRef<HTMLDivElement>(null)
	const scaled = servings !== null && chosen !== null && chosen !== servings

	function toggle(id: string) {
		setChecked((current) => {
			const next = new Set(current)
			if (!next.delete(id)) next.add(id)
			return next
		})
	}

	function reset() {
		setChosen(servings)
		// The "Scaled from" line disappears with the click, so keep keyboard focus inside the control.
		stepper.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus()
	}

	return (
		<DetailCard
			icon={ClipboardList}
			title="Ingredients"
			action={servings !== null && chosen !== null && (
				<ServingsStepper
					ref={stepper}
					value={chosen}
					min={MIN_SERVINGS}
					max={Math.max(MAX_SERVINGS, servings)}
					onChange={(value) => setChosen(clampServings(value, servings))}
				/>
			)}
		>
			{scaled && (
				<p className="mb-2 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
					Scaled from {servingsLabel(servings)}.
					<Button type="button" variant="link" className="h-11 px-1 sm:h-8" onClick={reset}>Reset</Button>
				</p>
			)}
			<ul aria-label="Ingredients" className="divide-y divide-border">
				{ingredients.map(({ id, name, quantity, unit }) => {
					const done = checked.has(id)
					return (
						<li key={id}>
							<label className="flex min-h-11 cursor-pointer items-center gap-3 py-2">
								<input type="checkbox" checked={done} onChange={() => toggle(id)} className="size-5 shrink-0 accent-primary" />
								<span className={done ? 'min-w-0 flex-1 text-muted-foreground line-through wrap-break-word' : 'min-w-0 flex-1 wrap-break-word'}>{name}</span>
								<span className={done ? 'shrink-0 text-sm text-muted-foreground line-through tabular-nums' : 'shrink-0 text-sm text-muted-foreground tabular-nums'}>
									{scaledAmount(quantity, unit, servings ?? 1, chosen ?? 1)}
								</span>
							</label>
						</li>
					)
				})}
			</ul>
		</DetailCard>
	)
}
