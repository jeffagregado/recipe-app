import type { RecipeDetail } from '@recipe-app/contracts/types'
import { FavoriteButton } from '@/features/recipes/components/favorite-button'
import { parseVideoLink } from '@/features/recipes/lib/video-link'
import { IngredientsCard } from './ingredients-card'
import { InstructionsCard } from './instructions-card'
import { NotesCard } from './notes-card'
import { RecipeCover } from './recipe-cover'
import { RecipeMenu } from '@/features/recipes/components/recipe-menu'
import { RecipeMeta } from './recipe-meta'
import { RecipeTitleRow } from './recipe-title-row'
import { RecipeVideoCard } from './recipe-video-card'

type RecipeDetailViewProps = {
	recipe: RecipeDetail
	videoThumbnailUrl: string | null
}

/**
 * DOM order is the mobile order: cover, header, Ingredients, Video, Instructions, Notes. From `lg` the cover sits beside
 * the header; from `xl` the first two sections sit in a sticky left column and the last two in the right one, so the
 * columns need no reordering.
 */
export function RecipeDetailView({ recipe, videoThumbnailUrl }: RecipeDetailViewProps) {
	const ingredients = recipe.ingredients.toSorted((a, b) => a.sortOrder - b.sortOrder)
	const instructions = recipe.instructions.toSorted((a, b) => a.stepNumber - b.stepNumber)
	const video = recipe.videoUrl ? parseVideoLink(recipe.videoUrl) : null

	const header = (
		<header className="flex flex-col gap-4">
			<RecipeTitleRow
				title={recipe.title}
				actions={(
					<>
						<FavoriteButton recipeId={recipe.id} title={recipe.title} isFavorite={recipe.isFavorite} variant="outline" className="sm:size-9" />
						<RecipeMenu recipeId={recipe.id} title={recipe.title} />
					</>
				)}
			/>
			<RecipeMeta
				categories={recipe.categories}
				prepTimeMinutes={recipe.prepTimeMinutes}
				cookTimeMinutes={recipe.cookTimeMinutes}
				servings={recipe.servings}
			/>
			{recipe.description && <p className="max-w-[65ch] text-lg leading-relaxed text-muted-foreground wrap-break-word">{recipe.description}</p>}
		</header>
	)

	return (
		<article className="space-y-8 lg:space-y-10">
			{recipe.imageUrl ? (
				<div className="grid gap-5 lg:grid-cols-12 lg:items-center lg:gap-8">
					<div className="lg:col-span-5"><RecipeCover src={recipe.imageUrl} title={recipe.title} /></div>
					<div className="lg:col-span-7">{header}</div>
				</div>
			) : header}

			<div className="grid gap-8 xl:grid-cols-12 xl:items-start xl:gap-10">
				{/* Tall content scrolls inside the sticky column instead of being cut off below the viewport. */}
				<div className="space-y-6 xl:sticky xl:top-6 xl:col-span-5 xl:-m-1 xl:max-h-[calc(100dvh-3rem)] xl:self-start xl:overflow-y-auto xl:p-1">
					<IngredientsCard key={recipe.updatedAt} ingredients={ingredients} servings={recipe.servings} />
					{video && <RecipeVideoCard title={recipe.title} video={video} posterUrl={recipe.imageUrl} thumbnailUrl={videoThumbnailUrl} />}
				</div>
				<div className="space-y-10 xl:col-span-7">
					<InstructionsCard instructions={instructions} />
					{recipe.notes && <NotesCard notes={recipe.notes} />}
				</div>
			</div>
		</article>
	)
}
