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

type DiscardChangesDialogProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	onDiscard: () => void
	description?: string
}

/** Asked before leaving a form with unsaved changes; Escape and the backdrop keep the user editing. */
export function DiscardChangesDialog({ open, onOpenChange, onDiscard, description = 'Your changes to this recipe will be lost.' }: DiscardChangesDialogProps) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Discard changes?</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Keep editing</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={onDiscard}>Discard</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
