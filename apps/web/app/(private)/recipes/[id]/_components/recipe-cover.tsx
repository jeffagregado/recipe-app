import { RecipePhoto } from '@/features/recipes/components/recipe-photo'

/** The cover photo, 4:3 like every recipe photo. Only when a cover exists; with none, the page simply starts at the title. */
export function RecipeCover({ src, title }: { src: string; title: string }) {
	return (
		<div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-muted shadow-recipe-card">
			<RecipePhoto
				src={src}
				alt={title}
				fill
				preload
				sizes="(min-width: 1440px) 560px, (min-width: 1024px) calc((100vw - 284px) * 0.42), 100vw"
				className="object-cover"
			/>
		</div>
	)
}
