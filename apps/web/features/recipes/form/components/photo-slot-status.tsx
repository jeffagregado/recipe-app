import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { PhotoSlot } from '../hooks/photo-slots'
import { FieldError, FieldStatus } from './form-field'

type PhotoSlotStatusProps = {
	photo: PhotoSlot
	/** The slot's problem: from the pick, the upload or the last save. */
	error?: string
	errorId: string
	progressLabel: string
	retryLabel: string
	disabled: boolean
	onRetry: () => void
	className?: string
}

/** Under a photo slot: the pick being shrunk, the upload's progress, and the slot's problem, with Retry when the upload failed. */
export function PhotoSlotStatus({ photo, error, errorId, progressLabel, retryLabel, disabled, onRetry, className }: PhotoSlotStatusProps) {
	return (
		<>
			{photo.preparing && <FieldStatus>Preparing photo…</FieldStatus>}
			{photo.uploading && !photo.preparing && (
				<div className="space-y-2">
					<FieldStatus>Uploading photo…</FieldStatus>
					<Progress value={photo.progress} aria-label={progressLabel} />
				</div>
			)}
			{error && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<FieldError id={errorId} className="min-w-0 flex-1">{error}</FieldError>
					{photo.uploadError && !photo.pickError && (
						<Button type="button" variant="outline" className={cn('h-11 px-4', className)} aria-label={retryLabel} disabled={disabled} onClick={onRetry}>Retry</Button>
					)}
				</div>
			)}
		</>
	)
}
