'use client'

import { ArrowLeft, Loader2 } from 'lucide-react'
import { useToastTop } from '@/components/layout/use-toast-top'
import { Button } from '@/components/ui/button'

/** Below md the header is 61px tall (8px padding each side, 44px Save, 1px border); toasts stack under it while it is mounted. */
const MOBILE_TOAST_TOP = 'calc(var(--mobile-header-height) + 61px + 1rem)'

type RecipeFormHeaderProps = {
	title: string
	submitLabel: string
	/** Completes the label from md up ("Save" + "Categories"); below md it is only read out, so the button fits beside Back and the title. */
	submitLabelDetail?: string
	/** The line under the title from md up. */
	description?: string
	busy: boolean
	onCancel: () => void
}

/** Mobile: Back / title / Save in one row. From md: title and subtitle left, Cancel and Save right. Always sticky. */
export function RecipeFormHeader({ title, submitLabel, submitLabelDetail, description = 'Fields marked * are required', busy, onCancel }: RecipeFormHeaderProps) {
	useToastTop(MOBILE_TOAST_TOP)
	return (
		<header className="sticky top-0 z-20 border-b border-border bg-background">
			<div className="mx-auto grid w-full max-w-360 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-4 md:py-3 lg:px-6 xl:px-8">
				<Button type="button" variant="ghost" className="-ml-2 h-11 px-2 md:hidden" disabled={busy} onClick={onCancel}>
					<ArrowLeft aria-hidden="true" /> Back
				</Button>
				<div className="min-w-0">
					<h1 className="truncate text-center text-base font-semibold md:text-left md:text-2xl md:font-bold">{title}</h1>
					<p className="hidden text-sm text-muted-foreground md:block">{description}</p>
				</div>
				<div className="flex items-center gap-2">
					<Button type="button" variant="outline" className="hidden h-11 px-4 md:inline-flex" disabled={busy} onClick={onCancel}>Cancel</Button>
					<Button type="submit" className="h-11 shrink-0 px-3 sm:px-4" disabled={busy}>
						{busy && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
						{busy ? 'Saving…' : (
							<span>{submitLabel}{submitLabelDetail && <>{' '}<span className="max-md:sr-only">{submitLabelDetail}</span></>}</span>
						)}
					</Button>
				</div>
			</div>
		</header>
	)
}
