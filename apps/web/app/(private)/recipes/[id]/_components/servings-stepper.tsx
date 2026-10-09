import { Minus, Plus } from 'lucide-react'
import { useId, type Ref } from 'react'
import { Button } from '@/components/ui/button'

type ServingsStepperProps = {
	value: number
	min: number
	max: number
	onChange: (value: number) => void
	ref?: Ref<HTMLDivElement>
}

/** On-screen servings control: − / current / +. 44px targets on mobile; the number is announced politely as it changes. */
export function ServingsStepper({ value, min, max, onChange, ref }: ServingsStepperProps) {
	const labelId = useId()

	return (
		<div ref={ref} role="group" aria-labelledby={labelId} className="flex items-center justify-between gap-3">
			<span id={labelId} className="text-sm text-muted-foreground">Servings</span>
			<div className="flex items-center overflow-hidden rounded-lg border border-input">
				<Button type="button" variant="ghost" size="icon" className="size-11 rounded-none sm:size-9" aria-label="Decrease servings" disabled={value <= min} onClick={() => onChange(value - 1)}>
					<Minus aria-hidden="true" />
				</Button>
				<output aria-live="polite" className="min-w-10 self-stretch border-x border-input px-2 py-2 text-center text-sm font-medium tabular-nums">{value}</output>
				<Button type="button" variant="ghost" size="icon" className="size-11 rounded-none sm:size-9" aria-label="Increase servings" disabled={value >= max} onClick={() => onChange(value + 1)}>
					<Plus aria-hidden="true" />
				</Button>
			</div>
		</div>
	)
}
