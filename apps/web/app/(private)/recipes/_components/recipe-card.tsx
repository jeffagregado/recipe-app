'use client'

import type { RecipeListItem } from '@recipe-app/contracts/types'
import Image from 'next/image'
import Link from 'next/link'
import { useId } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { FavoriteButton } from '@/features/recipes/components/favorite-button'
import { RecipeMenu } from '@/features/recipes/components/recipe-menu'
import { categoryVariants } from '@/features/recipes/lib/category-variants'

export type RecipeCardData = Pick<RecipeListItem, 'id' | 'title' | 'imageUrl' | 'categories' | 'updatedAt' | 'isFavorite'> & {
	updatedLabel: string
}

type RecipeCardProps = {
	recipe: RecipeCardData
	preload?: boolean
}

export function RecipeCard({ recipe, preload = false }: RecipeCardProps) {
	const titleId = useId()
	const href = `/recipes/${encodeURIComponent(recipe.id)}`

	return (
		<Card
			size="sm"
			role="article"
			aria-labelledby={titleId}
			className="group/recipe relative min-w-0 gap-0 rounded-[12px] py-0 shadow-recipe-card transition-shadow hover:shadow-recipe-card-hover"
		>
			<div className="relative aspect-video overflow-hidden">
				<Image
					src={recipe.imageUrl || '/recipes/recipe-placeholder.png'}
					alt=""
					fill
					preload={preload}
					sizes="(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) 50vw, 33vw"
					className="object-cover transition-transform duration-300 motion-safe:group-hover/recipe:scale-105"
				/>
				<div className="absolute top-2 right-2 z-10">
					<RecipeMenu recipeId={recipe.id} title={recipe.title} variant="card" />
				</div>
			</div>

			<CardContent className="flex flex-col gap-2 px-5 py-4">
				<h2 id={titleId} className="truncate text-lg leading-6 font-bold">
					<Link
						href={href}
						title={recipe.title}
						className="after:absolute after:inset-0 after:rounded-[12px] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
					>
						{recipe.title}
					</Link>
				</h2>
				{recipe.categories.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{recipe.categories.slice(0, 2).map((category) => (
							<Badge key={category} variant={categoryVariants[category]}>{category}</Badge>
						))}
					</div>
				)}
				<div className="flex min-w-0 items-center justify-between gap-2">
					<time dateTime={recipe.updatedAt} className="text-sm leading-5 text-muted-foreground">
						Updated {recipe.updatedLabel}
					</time>
					<FavoriteButton
						recipeId={recipe.id}
						title={recipe.title}
						isFavorite={recipe.isFavorite}
						className="relative z-10 -my-1 -mr-1 sm:size-8"
					/>
				</div>
			</CardContent>
		</Card>
	)
}
