'use client'

import { Loader2 } from 'lucide-react'
import { useLayoutEffect, useState, useTransition, type RefObject } from 'react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { deleteRecipe } from '@/features/recipes/actions/delete'
import type { DeleteResult } from '@/features/recipes/actions/results'
import { navigationError } from '@/features/recipes/lib/navigation-error'
import { useAppToast } from '@/lib/use-app-toast'

const ERRORS: Record<DeleteResult['reason'], string> = {
	failed: 'Couldn’t delete recipe. Try again.',
	'session-expired': 'Your session has expired. Sign in again to delete this recipe.',
}

type DeleteRecipeDialogProps = {
	recipeId: string
	title: string
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Where focus goes when the dialog closes without leaving the page. */
	returnFocusTo: RefObject<HTMLElement | null>
}

/**
 * Confirms the delete. A confirmed delete redirects, so the dialog only closes itself on a failure: the toast is the one
 * place the error is reported, and a modal dialog would hide the toast region from assistive technology.
 */
export function DeleteRecipeDialog({ recipeId, title, open, onOpenChange, returnFocusTo }: DeleteRecipeDialogProps) {
	const toast = useAppToast()
	const [pending, startTransition] = useTransition()
	// The redirect after a confirmed delete ends the transition slightly before the new page appears; stay disabled until then.
	const [leaving, setLeaving] = useState(false)
	const busy = pending || leaving

	// Cache Components keeps hidden pages mounted; a later visit must not start in the middle of a delete.
	useLayoutEffect(() => () => setLeaving(false), [])

	function confirm() {
		startTransition(async () => {
			let reason: DeleteResult['reason']
			try {
				reason = (await deleteRecipe(recipeId)).reason
			} catch (error) {
				// A confirmed delete redirects, which surfaces here as a navigation error that React and Next must receive.
				const navigation = navigationError(error)
				if (navigation) {
					setLeaving(true)
					throw navigation
				}
				reason = 'failed'
			}
			onOpenChange(false)
			toast.error(ERRORS[reason])
		})
	}

	return (
		<AlertDialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next) }}>
			<AlertDialogContent finalFocus={returnFocusTo}>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete recipe?</AlertDialogTitle>
					<AlertDialogDescription className="wrap-break-word">“{title}” and its photos will be permanently deleted.</AlertDialogDescription>
				</AlertDialogHeader>
				<p role="status" className="sr-only">{busy ? 'Deleting recipe…' : ''}</p>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" disabled={busy} onClick={confirm}>
						{busy && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
						{busy ? 'Deleting…' : 'Delete recipe'}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
