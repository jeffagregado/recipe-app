'use client'

import { CirclePlay, ExternalLink, Play } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RecipePhoto } from '@/features/recipes/components/recipe-photo'
import type { VideoLink } from '@/features/recipes/lib/video-link'
import { DetailCard } from './detail-card'

type RecipeVideoCardProps = {
	title: string
	video: VideoLink
	/** The recipe cover, the poster when the video has no thumbnail or it cannot be loaded. */
	posterUrl: string | null
	/** The video's own thumbnail on YouTube or Vimeo, loaded through the image optimizer only. */
	thumbnailUrl: string | null
}

const HOSTS = { youtube: 'YouTube', vimeo: 'Vimeo' } as const
const POSTER_SIZES = '(min-width: 1280px) 400px, (min-width: 640px) 560px, 100vw'

/** A poster with Play; the iframe (and so any browser request to the video host) exists only after Play is pressed. */
type VideoPlayerProps = Pick<RecipeVideoCardProps, 'title' | 'posterUrl' | 'thumbnailUrl'> & { kind: keyof typeof HOSTS; embedUrl: string }

function VideoPlayer({ title, kind, embedUrl, posterUrl, thumbnailUrl }: VideoPlayerProps) {
	const [playing, setPlaying] = useState(false)
	const [thumbnailFailed, setThumbnailFailed] = useState(false)
	const frame = useRef<HTMLIFrameElement>(null)
	const captionId = useId()

	// The Play button disappears when the player replaces the poster; hand keyboard focus to the player.
	useEffect(() => {
		if (playing) frame.current?.focus()
	}, [playing])

	// Next.js keeps the page it navigated away from mounted but hidden, and a hidden iframe keeps playing.
	// Dropping back to the poster removes the iframe, which is the only way to stop a cross-origin player.
	useLayoutEffect(() => {
		return () => setPlaying(false)
	}, [])

	if (playing) {
		// Autoplay is requested only because Play was just pressed.
		const url = new URL(embedUrl)
		url.searchParams.set('autoplay', '1')
		return (
			<div className="aspect-video overflow-hidden rounded-xl bg-black">
				<iframe
					ref={frame}
					src={url.href}
					title={`Video for ${title}`}
					allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
					referrerPolicy="strict-origin-when-cross-origin"
					className="size-full border-0"
				/>
			</div>
		)
	}

	return (
		<div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
			{thumbnailUrl && !thumbnailFailed ? (
				// Never `unoptimized`: the optimizer fetches the thumbnail on the server, so the browser does not contact the video host.
				<Image src={thumbnailUrl} alt="" fill sizes={POSTER_SIZES} className="object-cover" onError={() => setThumbnailFailed(true)} />
			) : (
				posterUrl && <RecipePhoto src={posterUrl} alt="" fill sizes={POSTER_SIZES} className="object-cover" />
			)}
			<div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-black/50 via-black/10 to-black/10" />
			<Button
				type="button"
				variant="secondary"
				aria-label="Play video"
				aria-describedby={captionId}
				className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/90 text-foreground shadow-floating hover:bg-background"
				onClick={() => setPlaying(true)}
			>
				<Play aria-hidden="true" className="size-7 fill-current" />
			</Button>
			<p id={captionId} className="absolute bottom-2 left-3 text-sm font-medium text-white drop-shadow">Plays from {HOSTS[kind]}</p>
		</div>
	)
}

/** YouTube/Vimeo get a click-to-load player; any other host is a plain link that opens in a new tab. */
export function RecipeVideoCard({ title, video, posterUrl, thumbnailUrl }: RecipeVideoCardProps) {
	return (
		<DetailCard icon={CirclePlay} title="Video">
			{video.kind === 'link' ? (
				<a
					href={video.href}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex min-h-11 items-center gap-2 text-primary underline underline-offset-4"
				>
					Watch video (opens in a new tab)
					<ExternalLink aria-hidden="true" className="size-4" />
				</a>
			) : (
				<VideoPlayer title={title} kind={video.kind} embedUrl={video.embedUrl} posterUrl={posterUrl} thumbnailUrl={thumbnailUrl} />
			)}
		</DetailCard>
	)
}
