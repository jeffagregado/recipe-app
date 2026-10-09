import type { RecipeDetail } from '@recipe-app/contracts/types'
import { FavoriteButton } from '@/features/recipes/components/favorite-button'
import { parseVideoLink } from '@/features/recipes/lib/video-link'
import { IngredientsCard } from './ingredients-card'
import { InstructionsCard } from './instructions-card'
import { NotesCard } from './notes-card'
import { RecipeCover } from './recipe-cover'
import { RecipeMenu } from './recipe-menu'
import { RecipeMeta } from './recipe-meta'
import { RecipeTitleRow } from './recipe-title-row'
import { RecipeVideoCard } from './recipe-video-card'

type RecipeDetailViewProps = {
	recipe: RecipeDetail
}

/**
 * DOM order is the mobile order: Ingredients, Video, Instructions, Notes. From `xl` the first two sit in a sticky
 * left column and the last two in the right one, so the columns need no reordering.
 */
export function RecipeDetailView({ recipe }: RecipeDetailViewProps) {
	const ingredients = recipe.ingredients.toSorted((a, b) => a.sortOrder - b.sortOrder)
	const instructions = recipe.instructions.toSorted((a, b) => a.stepNumber - b.stepNumber)
	const video = recipe.videoUrl ? parseVideoLink(recipe.videoUrl) : null

	return (
		<article className="space-y-4 sm:space-y-5">
			{recipe.imageUrl && <RecipeCover src={recipe.imageUrl} title={recipe.title} />}

			<header className="space-y-3">
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
				{recipe.description && <p className="wrap-break-word">{recipe.description}</p>}
			</header>

			<div className="grid gap-4 sm:gap-5 xl:grid-cols-12 xl:items-start">
				{/* Tall content scrolls inside the sticky column instead of being cut off below the viewport. */}
				<div className="space-y-4 sm:space-y-5 xl:sticky xl:top-6 xl:col-span-5 xl:-m-1 xl:max-h-[calc(100dvh-3rem)] xl:self-start xl:overflow-y-auto xl:p-1">
					<IngredientsCard key={recipe.updatedAt} ingredients={ingredients} servings={recipe.servings} />
					{video && <RecipeVideoCard title={recipe.title} video={video} posterUrl={recipe.imageUrl} />}
				</div>
				<div className="space-y-4 sm:space-y-5 xl:col-span-7">
					<InstructionsCard instructions={instructions} />
					{recipe.notes && <NotesCard notes={recipe.notes} />}
				</div>
			</div>
		</article>
	)
}
