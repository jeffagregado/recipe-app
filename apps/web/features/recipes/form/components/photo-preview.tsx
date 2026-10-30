import { RecipePhoto } from '@/features/recipes/components/recipe-photo'
import { cn } from '@/lib/utils'
import type { FilledPhoto } from '../lib/recipe-photo'
import { PhotoThumbnail } from './photo-thumbnail'

type PhotoPreviewProps = {
	photo: FilledPhoto
	/** Names the slot for assistive technology, for example "Current cover photo". */
	label: string
	sizes: string
	className?: string
}

/**
 * The saved photo loads like on the recipe page. Its signed URL expires (15 minutes), so on an edit page left open for
 * longer every attempt can fail; a neutral placeholder then stands in and the slot stays "kept".
 */
export function PhotoPreview({ photo, label, sizes, className }: PhotoPreviewProps) {
	if ('file' in photo) return <PhotoThumbnail file={photo.file} className={cn('object-cover', className)} />
	return (
		<div className={cn('relative overflow-hidden bg-muted', className)}>
			<RecipePhoto key={photo.url} src={photo.url} alt={label} fill sizes={sizes} unavailableLabel={`${label} (preview unavailable)`} className="object-cover" />
		</div>
	)
}
