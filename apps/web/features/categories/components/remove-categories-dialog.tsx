import type { CategoryWithUsage } from '@recipe-app/contracts/types'
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
import { recipeCountLabel } from '../lib/category-form'

type RemoveCategoriesDialogProps = {
	open: boolean
	/** Removed categories that still tag recipes. */
	removed: CategoryWithUsage[]
	onKeep: () => void
	onRemove: () => void
}

/** Asked on Save only when a removed category still tags recipes; Escape and the backdrop keep the categories. */
export function RemoveCategoriesDialog({ open, removed, onKeep, onRemove }: RemoveCategoriesDialogProps) {
	const only = removed.length === 1 ? removed[0] : null

	return (
		<AlertDialog open={open} onOpenChange={(next) => { if (!next) onKeep() }}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{only ? `Remove “${only.name}”?` : `Remove ${removed.length} categories?`}</AlertDialogTitle>
					<AlertDialogDescription>
						{only
							? `${recipeCountLabel(only.recipeCount)} ${only.recipeCount === 1 ? 'is' : 'are'} tagged with it. They’ll stay, but the tag is removed from them. This can’t be undone.`
							: `${removed.map(({ name, recipeCount }) => `“${name}” tags ${recipeCountLabel(recipeCount)}`).join(', ')}. The recipes stay, but these tags are removed from them. This can’t be undone.`}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onRemove}>Remove and save</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
