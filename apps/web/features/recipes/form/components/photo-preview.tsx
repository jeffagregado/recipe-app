import { ImageOff } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { FilledPhoto } from '../lib/recipe-photo'
import { PhotoThumbnail } from './photo-thumbnail'

/**
 * The saved photo goes through next/image, like on the recipe page. Its signed URL expires (15 minutes), so on an
 * edit page left open for longer the request can fail; a neutral placeholder then stands in and the slot stays "kept".
 */
function ExistingPhoto({ url, label, sizes, className }: { url: string; label: string; sizes: string; className?: string }) {
	const [failed, setFailed] = useState(false)

	return (
		<div className={cn('relative overflow-hidden bg-muted', className)}>
			{failed ? (
				<div role="img" aria-label={`${label} (preview unavailable)`} className="grid size-full place-items-center text-muted-foreground">
					<ImageOff aria-hidden="true" className="size-5" />
				</div>
			) : (
				<Image src={url} alt={label} fill sizes={sizes} onError={() => setFailed(true)} className="object-cover" />
			)}
		</div>
	)
}

type PhotoPreviewProps = {
	photo: FilledPhoto
	/** Names the slot for assistive technology, for example "Current cover photo". */
	label: string
	sizes: string
	className?: string
}

export function PhotoPreview({ photo, label, sizes, className }: PhotoPreviewProps) {
	if (photo.kind === 'new') return <PhotoThumbnail file={photo.file} className={cn('object-cover', className)} />
	return <ExistingPhoto key={photo.url} url={photo.url} label={label} sizes={sizes} className={className} />
}
