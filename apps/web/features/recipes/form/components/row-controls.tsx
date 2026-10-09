import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RowControlsProps = {
	noun: 'ingredient' | 'step'
	position: number
	count: number
	onMove: (direction: 'up' | 'down') => void
	onRemove: () => void
	className?: string
}

export function RowControls({ noun, position, count, onMove, onRemove, className }: RowControlsProps) {
	return (
		<div className={cn('flex shrink-0 items-center', className)}>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-11"
				aria-label={`Move ${noun} ${position} up`}
				data-control="move-up"
				disabled={position === 1}
				onClick={() => onMove('up')}
			>
				<ChevronUp aria-hidden="true" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-11"
				aria-label={`Move ${noun} ${position} down`}
				data-control="move-down"
				disabled={position === count}
				onClick={() => onMove('down')}
			>
				<ChevronDown aria-hidden="true" />
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="size-11"
				aria-label={`Remove ${noun} ${position}`}
				data-control="remove"
				onClick={onRemove}
			>
				<Trash2 aria-hidden="true" />
			</Button>
		</div>
	)
}
