'use client'

import { EllipsisVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { DeleteRecipeDialog } from './delete-recipe-dialog'

const ITEM_CLASS = 'min-h-11 sm:min-h-8'

type RecipeMenuProps = {
	recipeId: string
	title: string
	/** `page` is the round ⋮ beside the recipe title; `card` is the square ⋯ over a list card's photo. */
	variant?: 'page' | 'card'
}

/** The options menu of one recipe: Edit recipe, and Delete recipe behind a confirmation. */
export function RecipeMenu({ recipeId, title, variant = 'page' }: RecipeMenuProps) {
	const [confirmingDelete, setConfirmingDelete] = useState(false)
	const triggerRef = useRef<HTMLButtonElement>(null)

	// Cache Components keeps hidden pages mounted; a returning visitor should not find the question still open.
	useLayoutEffect(() => () => setConfirmingDelete(false), [])

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<Button ref={triggerRef} variant="outline" size="icon" className={cn('size-11 rounded-full sm:size-9', variant === 'card' && 'bg-background/90 backdrop-blur-sm')} />}
					aria-label={`More options for ${title}`}
				>
					{variant === 'card' ? <MoreHorizontal aria-hidden="true" /> : <EllipsisVertical aria-hidden="true" />}
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="min-w-44">
					<DropdownMenuGroup>
						<DropdownMenuItem className={ITEM_CLASS} render={<Link href={`/recipes/${encodeURIComponent(recipeId)}/edit`} />}>
							<Pencil aria-hidden="true" />
							Edit recipe
						</DropdownMenuItem>
						<DropdownMenuItem className={ITEM_CLASS} variant="destructive" onClick={() => setConfirmingDelete(true)}>
							<Trash2 aria-hidden="true" />
							Delete recipe
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
			<DeleteRecipeDialog recipeId={recipeId} title={title} open={confirmingDelete} onOpenChange={setConfirmingDelete} returnFocusTo={triggerRef} />
		</>
	)
}
