'use client'

import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFavorite } from '../hooks/use-favorite'

type FavoriteButtonProps = {
	recipeId: string
	title: string
	/** The saved state the server rendered; this tab's own toggles take over from there. */
	isFavorite: boolean
	variant?: 'ghost' | 'outline'
	className?: string
}

/** Heart toggle shared by the recipe page and the recipe cards. */
export function FavoriteButton({ recipeId, title, isFavorite, variant = 'ghost', className }: FavoriteButtonProps) {
	const { favorite, toggle } = useFavorite(recipeId, isFavorite)

	return (
		<Button
			type="button"
			variant={variant}
			size="icon"
			aria-label={`${favorite ? 'Remove' : 'Add'} ${title} ${favorite ? 'from' : 'to'} favorites`}
			aria-pressed={favorite}
			onClick={() => void toggle()}
			className={cn('size-11 rounded-full', className)}
		>
			<Heart aria-hidden="true" className={cn(favorite && 'fill-destructive text-destructive')} />
		</Button>
	)
}
