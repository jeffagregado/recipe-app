'use client'

import { EllipsisVertical, Pencil, Trash2 } from 'lucide-react'
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
import { DeleteRecipeDialog } from './delete-recipe-dialog'

const ITEM_CLASS = 'min-h-11 sm:min-h-8'

/** The ⋮ menu beside the title: Edit recipe, and Delete recipe behind a confirmation. */
export function RecipeMenu({ recipeId, title }: { recipeId: string; title: string }) {
	const [confirmingDelete, setConfirmingDelete] = useState(false)
	const triggerRef = useRef<HTMLButtonElement>(null)

	// Cache Components keeps hidden pages mounted; a returning visitor should not find the question still open.
	useLayoutEffect(() => () => setConfirmingDelete(false), [])

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={<Button ref={triggerRef} variant="outline" size="icon" className="size-11 rounded-full sm:size-9" />}
					aria-label={`More options for ${title}`}
				>
					<EllipsisVertical aria-hidden="true" />
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
