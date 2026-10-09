import type { RecipeDetail } from '@recipe-app/contracts/types'
import Image from 'next/image'

import { Badge } from '@/components/ui/badge'
import { categoryVariants } from '@/features/recipes/lib/category-variants'
import { ingredientAmount, recipeMetaLabels } from '../_lib/recipe-detail-format'
import { RecipeVideo } from './recipe-video'

type RecipeDetailViewProps = {
	recipe: RecipeDetail
	saved: boolean
}

export function RecipeDetailView({ recipe, saved }: RecipeDetailViewProps) {
	const meta = recipeMetaLabels(recipe)
	const ingredients = recipe.ingredients.toSorted((a, b) => a.sortOrder - b.sortOrder)
	const instructions = recipe.instructions.toSorted((a, b) => a.stepNumber - b.stepNumber)

	return (
		<article className="mx-auto w-full max-w-3xl space-y-8">
			{saved && <p role="status" className="rounded-lg bg-muted px-4 py-3 text-sm font-medium">Recipe saved</p>}

			{recipe.imageUrl && (
				<div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
					<Image
						src={recipe.imageUrl}
						alt={recipe.title}
						fill
						preload
						sizes="(min-width: 768px) 768px, 100vw"
						className="object-cover"
					/>
				</div>
			)}

			<header className="space-y-3">
				<h1 className="text-3xl font-bold wrap-break-word lg:text-4xl">{recipe.title}</h1>
				{recipe.categories.length > 0 && (
					<ul aria-label="Categories" className="flex flex-wrap gap-1.5">
						{recipe.categories.map((category) => (
							<li key={category}><Badge variant={categoryVariants[category]}>{category}</Badge></li>
						))}
					</ul>
				)}
				{meta.length > 0 && (
					<ul aria-label="Recipe details" className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
						{meta.map((label) => <li key={label}>{label}</li>)}
					</ul>
				)}
				{recipe.description && <p className="wrap-break-word">{recipe.description}</p>}
			</header>

			<section aria-labelledby="recipe-ingredients-heading" className="space-y-3">
				<h2 id="recipe-ingredients-heading" className="text-xl font-bold">Ingredients</h2>
				<ul aria-label="Ingredients" className="list-disc space-y-1 pl-5">
					{ingredients.map((ingredient) => {
						const amount = ingredientAmount(ingredient)
						return (
							<li key={ingredient.id} className="wrap-break-word">
								{amount ? `${amount} ${ingredient.name}` : `${ingredient.name}, to taste`}
							</li>
						)
					})}
				</ul>
			</section>

			{recipe.videoUrl && <RecipeVideo title={recipe.title} videoUrl={recipe.videoUrl} />}

			<section aria-labelledby="recipe-instructions-heading" className="space-y-3">
				<h2 id="recipe-instructions-heading" className="text-xl font-bold">Instructions</h2>
				<ol aria-label="Instructions" className="list-decimal space-y-5 pl-5">
					{instructions.map((step) => (
						<li key={step.id} className="space-y-3 pl-1">
							<p className="whitespace-pre-line wrap-break-word">{step.description}</p>
							{step.imageUrl && (
								<div className="relative aspect-video max-w-md overflow-hidden rounded-lg bg-muted">
									<Image
										src={step.imageUrl}
										alt={`Step ${step.stepNumber} photo`}
										fill
										sizes="(min-width: 768px) 448px, calc(100vw - 56px)"
										className="object-cover"
									/>
								</div>
							)}
						</li>
					))}
				</ol>
			</section>

			{recipe.notes && (
				<section aria-labelledby="recipe-notes-heading" className="space-y-3">
					<h2 id="recipe-notes-heading" className="text-xl font-bold">Notes</h2>
					<p className="whitespace-pre-line wrap-break-word">{recipe.notes}</p>
				</section>
			)}
		</article>
	)
}
