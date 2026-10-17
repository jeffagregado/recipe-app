'use client'

import { Loader2, RotateCcw } from 'lucide-react'
import { useState, useTransition } from 'react'
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
import { Button } from '@/components/ui/button'
import { broadcastAuth, clearPrivateQueries } from '@/features/auth/session-client'
import { useAppToast } from '@/lib/use-app-toast'
import { resetDemo } from './actions'

const RESET_FAILED = 'The demo could not reset. Please try again.'

/**
 * Confirms, then swaps the Demo account for a fresh one. A full page load opens it, so nothing cached for the old account
 * survives, and other tabs reload into the new one. A refusal closes the dialog and is reported in a toast, as a failed delete is.
 */
export function ResetDemoButton() {
	const toast = useAppToast()
	const [open, setOpen] = useState(false)
	const [pending, startTransition] = useTransition()
	// The page load after a reset takes a moment; stay disabled until it replaces this page.
	const [leaving, setLeaving] = useState(false)
	const busy = pending || leaving

	function confirm() {
		startTransition(async () => {
			let message = RESET_FAILED
			try {
				const result = await resetDemo()
				if (result.ok) {
					setLeaving(true)
					clearPrivateQueries()
					broadcastAuth('login')
					window.location.replace('/recipes')
					return
				}
				message = result.message
			} catch {
				// The fresh account may or may not exist; the visitor stays signed in to the current one either way.
			}
			setOpen(false)
			toast.error(message)
		})
	}

	return (
		<>
			<Button type="button" variant="outline" size="sm" className="h-9 bg-background" onClick={() => setOpen(true)}>
				<RotateCcw aria-hidden="true" />
				Reset demo
			</Button>
			<AlertDialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Reset the demo?</AlertDialogTitle>
						<AlertDialogDescription>Your changes are discarded and you start again with the sample recipes.</AlertDialogDescription>
					</AlertDialogHeader>
					<p role="status" className="sr-only">{busy ? 'Resetting the demo…' : ''}</p>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={busy} onClick={confirm}>
							{busy && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
							{busy ? 'Resetting…' : 'Reset demo'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
