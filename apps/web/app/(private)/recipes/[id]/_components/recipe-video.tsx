import { parseVideoLink } from '@/features/recipes/lib/video-link'

type RecipeVideoProps = {
	title: string
	videoUrl: string
}

/** Embeds only validated YouTube/Vimeo IDs; any other https link opens in a new tab. */
export function RecipeVideo({ title, videoUrl }: RecipeVideoProps) {
	const video = parseVideoLink(videoUrl)
	if (!video) return null

	return (
		<section aria-labelledby="recipe-video-heading" className="space-y-3">
			<h2 id="recipe-video-heading" className="text-xl font-bold">Video</h2>
			{video.kind === 'link' ? (
				<a
					href={video.href}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
				>
					Watch video (opens in a new tab)
				</a>
			) : (
				<div className="aspect-video overflow-hidden rounded-xl bg-muted">
					<iframe
						src={video.embedUrl}
						title={`Video for ${title}`}
						loading="lazy"
						allow="encrypted-media; picture-in-picture; fullscreen"
						referrerPolicy="strict-origin-when-cross-origin"
						className="size-full border-0"
					/>
				</div>
			)}
		</section>
	)
}
