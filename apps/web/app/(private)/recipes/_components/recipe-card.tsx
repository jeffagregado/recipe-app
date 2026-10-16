'use client'

import type { RecipeListItem } from '@recipe-app/contracts/types'
import { Clock, Users } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useId } from 'react'

import { Badge } from '@/components/ui/badge'
import { FavoriteButton } from '@/features/recipes/components/favorite-button'
import { RecipeMenu } from '@/features/recipes/components/recipe-menu'
import { RecipeCardPlaceholder } from './recipe-card-placeholder'

export type RecipeCardData = Pick<RecipeListItem, 'id' | 'title' | 'imageUrl' | 'categories' | 'updatedAt' | 'isFavorite'> & {
	/** "25 min" when both times are known, else the one that is ("Prep 10 min"), else null. */
	timeLabel: string | null
	servingsLabel: string | null
	updatedLabel: string
}

type RecipeCardProps = {
	recipe: RecipeCardData
	preload?: boolean
}

/** One recipe in the list: the photo leads, then the title, time and servings, with the heart and the menu as overlays. */
export function RecipeCard({ recipe, preload = false }: RecipeCardProps) {
	const titleId = useId()
	const href = `/recipes/${encodeURIComponent(recipe.id)}`
	const details = [recipe.timeLabel, recipe.servingsLabel].filter((label) => label !== null)

	return (
		<article
			aria-labelledby={titleId}
			className="group/recipe relative flex min-w-0 flex-col gap-3 rounded-2xl transition-transform motion-safe:hover:-translate-y-0.5"
		>
			<div className="relative aspect-4/3 overflow-hidden rounded-2xl bg-muted shadow-recipe-card transition-shadow group-hover/recipe:shadow-recipe-card-hover">
				{recipe.imageUrl ? (
					<Image
						src={recipe.imageUrl}
						alt=""
						fill
						preload={preload}
						sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) 50vw, (max-width: 1535px) 33vw, 25vw"
						className="object-cover transition-transform duration-300 motion-safe:group-hover/recipe:scale-105"
					/>
				) : <RecipeCardPlaceholder />}
				<div className="absolute top-2 right-2 z-10">
					<RecipeMenu recipeId={recipe.id} title={recipe.title} variant="card" />
				</div>
			</div>

			<div className="flex min-w-0 flex-col gap-1.5 px-1">
				<h2 id={titleId} className="line-clamp-2 text-lg leading-6 font-semibold tracking-tight text-balance">
					<Link
						href={href}
						className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2"
					>
						{recipe.title}
					</Link>
				</h2>
				{details.length > 0 && (
					<p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground tabular-nums">
						{recipe.timeLabel !== null && <span className="inline-flex items-center gap-1.5"><Clock aria-hidden="true" className="size-3.5" />{recipe.timeLabel}</span>}
						{recipe.servingsLabel !== null && <span className="inline-flex items-center gap-1.5"><Users aria-hidden="true" className="size-3.5" />{recipe.servingsLabel}</span>}
					</p>
				)}
				<div className="flex min-w-0 items-center justify-between gap-2">
					<div className="flex min-w-0 flex-wrap items-center gap-1.5">
						{recipe.categories.slice(0, 2).map((category) => (
							<Badge key={category.id} variant="category">{category.name}</Badge>
						))}
						{recipe.categories.length === 0 && (
							<time dateTime={recipe.updatedAt} className="text-sm text-muted-foreground">Updated {recipe.updatedLabel}</time>
						)}
					</div>
					<FavoriteButton
						recipeId={recipe.id}
						title={recipe.title}
						isFavorite={recipe.isFavorite}
						className="relative z-10 -my-1 -mr-1 sm:size-9"
					/>
				</div>
			</div>
		</article>
	)
}
