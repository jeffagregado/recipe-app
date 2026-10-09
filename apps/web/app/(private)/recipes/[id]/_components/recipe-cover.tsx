import Image from 'next/image'

/** Banner only when a cover exists; with none, the page simply starts at the title. */
export function RecipeCover({ src, title }: { src: string; title: string }) {
	return (
		<div className="relative aspect-8/5 overflow-hidden rounded-xl bg-muted sm:aspect-2/1 lg:aspect-[3.8/1]">
			<Image
				src={src}
				alt={title}
				fill
				preload
				sizes="(min-width: 1440px) 1376px, (min-width: 1024px) calc(100vw - 284px), 100vw"
				className="object-cover"
			/>
		</div>
	)
}
