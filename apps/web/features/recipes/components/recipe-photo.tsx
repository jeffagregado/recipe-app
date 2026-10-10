'use client'

import { ImageOff } from 'lucide-react'
import Image, { type ImageProps } from 'next/image'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/** Attempts 0 and 1 go through the image optimizer; attempt 2 loads the signed URL directly; 3 means nothing loaded. */
const DIRECT_ATTEMPT = 2
const FAILED = 3

type RecipePhotoProps = ImageProps & {
	/** Accessible name of the placeholder shown when the photo cannot be loaded at all. */
	unavailableLabel?: string
}

/**
 * A stored recipe photo through next/image. The optimizer downloads the original from storage first and gives up when
 * that is slow, so a failed request is retried once and then loaded straight from the signed URL (`unoptimized`).
 * `fill` photos show a skeleton until they load; the parent must be positioned.
 */
export function RecipePhoto({ unavailableLabel, alt, fill, ...props }: RecipePhotoProps) {
	const [attempt, setAttempt] = useState(0)
	const [loaded, setLoaded] = useState(false)
	// Comparing with the rendered attempt keeps a repeated report of the same failure from skipping a step.
	const fail = () => setAttempt((current) => (current === attempt ? attempt + 1 : current))

	if (attempt >= FAILED) {
		return (
			<div
				role="img"
				aria-label={unavailableLabel ?? (alt ? `${alt} (photo unavailable)` : 'Photo unavailable')}
				className={cn('grid place-items-center bg-muted text-muted-foreground', fill ? 'absolute inset-0' : 'aspect-4/3 w-full rounded-lg')}
			>
				<ImageOff aria-hidden="true" className="size-5" />
			</div>
		)
	}

	return (
		<>
			{fill && !loaded && <Skeleton aria-hidden="true" className="absolute inset-0 rounded-none" />}
			<Image
				key={attempt}
				{...props}
				alt={alt}
				fill={fill}
				unoptimized={attempt === DIRECT_ATTEMPT}
				// A photo can finish (or fail) before hydration attaches the handlers below, so check its state on mount too.
				ref={(node) => {
					if (!node?.complete) return
					if (node.naturalWidth > 0) setLoaded(true)
					else fail()
				}}
				onLoad={() => setLoaded(true)}
				onError={fail}
			/>
		</>
	)
}
