'use client'

import type { RecipeSummary } from '@recipe-app/contracts/types'
import { BookOpen, Heart, MoreHorizontal } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useId, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { categoryVariants } from '@/features/recipes/lib/category-variants'
import { cn } from '@/lib/utils'

export type RecipeCardData = Pick<RecipeSummary, 'id' | 'title' | 'imageUrl' | 'categories' | 'updatedAt'> & {
	updatedLabel: string
}

type RecipeCardProps = {
	recipe: RecipeCardData
	preload?: boolean
}

export function RecipeCard({ recipe, preload = false }: RecipeCardProps) {
	const [favorites, setFavorites] = useState<Set<string>>(() => new Set())
	const isFavorite = favorites.has(recipe.id)

	const titleId = useId()
	const href = `/recipes/${encodeURIComponent(recipe.id)}`
	const favoriteLabel = `${isFavorite ? 'Remove' : 'Add'} ${recipe.title} ${isFavorite ? 'from' : 'to'} favorites`


	function toggleFavorite(id: string) {
		setFavorites((current) => {
			const next = new Set(current)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}

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
					<DropdownMenu>
						<DropdownMenuTrigger
							render={<Button variant="outline" size="icon" className="size-11 rounded-[6px] sm:size-9" />}
							aria-label={`More options for ${recipe.title}`}
						>
							<MoreHorizontal aria-hidden="true" />
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-44">
							<DropdownMenuGroup>
								<DropdownMenuItem render={<Link href={href} />}>
									<BookOpen aria-hidden="true" />
									View recipe
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() =>toggleFavorite(recipe.id)}>
									<Heart aria-hidden="true" />
									{isFavorite ? 'Remove from favorites' : 'Add to favorites'}
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
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
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={favoriteLabel}
						aria-pressed={isFavorite}
						onClick={() =>toggleFavorite(recipe.id)}
						className="relative z-10 -my-1 -mr-1 size-11 rounded-full sm:size-8"
					>
						<Heart aria-hidden="true" className={cn(isFavorite && 'fill-destructive text-destructive')} />
					</Button>
				</div>
			</CardContent>
		</Card>
	)
}
