import { ImageIcon } from 'lucide-react'
import { useRef } from 'react'
import { useFormContext, useWatch, useFormState } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { IMAGE_HINT } from '../lib/recipe-files'
import type { RecipeFormValues } from '../lib/recipe-form-schema'
import { fieldA11y } from '../lib/field-props'
import { PhotoPicker } from './photo-picker'
import { photoCaption } from '../lib/recipe-photo'
import { PhotoPreview } from './photo-preview'
import { PhotoSlotStatus } from './photo-slot-status'
import { SectionCard } from './section-card'
import { usePhotoSlot } from '../hooks/photo-slots'

const FIELD_ID = 'recipe-cover'

export function CoverPhotoSection({ disabled }: { disabled: boolean }) {
	const { control } = useFormContext<RecipeFormValues>()
	const { errors } = useFormState({ control })
	const cover = useWatch({ control, name: 'cover' })
	const photo = usePhotoSlot('cover', cover)
	const error = photo.pickError ?? photo.uploadError ?? errors.cover?.message
	const removeButton = useRef<HTMLButtonElement>(null)

	function retryUpload() {
		photo.retry()
		// Retry disappears while the upload runs; keep focus on the slot.
		removeButton.current?.focus()
	}
	const a11y = fieldA11y(FIELD_ID, error)

	return (
		<SectionCard icon={ImageIcon} title="Cover Photo" optional>
			{cover.kind !== 'none' ? (
				<div className="space-y-3">
					<PhotoPreview photo={cover} label="Current cover photo" sizes="(min-width: 1280px) 40vw, 100vw" className="aspect-4/3 w-full rounded-lg" />
					<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
						<p className="min-w-0 flex-1 text-sm text-muted-foreground wrap-break-word">{photoCaption(cover)}</p>
						<PhotoPicker label="Replace cover photo" onPick={photo.pick} disabled={disabled} a11y={a11y} className="rounded-lg">
							<span className="inline-flex h-11 items-center rounded-lg border border-border bg-background px-4 text-sm font-medium">Replace</span>
						</PhotoPicker>
						<Button ref={removeButton} type="button" variant="outline" className="h-11 px-4" aria-label="Remove cover photo" disabled={disabled} onClick={photo.remove}>Remove</Button>
					</div>
				</div>
			) : (
				<PhotoPicker label="Add cover photo" onPick={photo.pick} disabled={disabled} a11y={a11y} className="rounded-xl">
					<div className="flex min-h-24 items-center gap-3 rounded-xl border border-dashed border-input p-4 hover:bg-muted/50">
						<span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
							<ImageIcon aria-hidden="true" className="size-5" />
						</span>
						<span className="min-w-0 space-y-0.5">
							<span className="block text-sm font-medium md:hidden">Tap to add a photo</span>
							<span className="hidden text-sm font-medium md:block">Drag a photo here, or click to browse</span>
							<span className="block text-xs text-muted-foreground">{IMAGE_HINT}</span>
						</span>
					</div>
				</PhotoPicker>
			)}
			<PhotoSlotStatus photo={photo} error={error} errorId={`${FIELD_ID}-error`} progressLabel="Cover photo upload" retryLabel="Retry cover photo upload"
				disabled={disabled} onRetry={retryUpload} />
		</SectionCard>
	)
}
