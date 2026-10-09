import { Button } from '@/components/ui/button'
import type { FormAlert } from '../hooks/use-recipe-submission'

type RecipeFormAlertProps = { alert: FormAlert; busy: boolean; onRetry: () => void }

/** Form-level outcome of a save that did not redirect; field errors stay inline under their fields. */
export function RecipeFormAlert({ alert, busy, onRetry }: RecipeFormAlertProps) {
	return (
		<div role="alert" className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
			<p className="font-medium wrap-break-word">{alert.message}</p>
			{alert.details.length > 0 && (
				<ul className="list-disc space-y-1 pl-5">
					{alert.details.map((detail) => <li key={detail} className="wrap-break-word">{detail}</li>)}
				</ul>
			)}
			{alert.status === 'session-expired' && (
				<a href="/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">Open sign in in a new tab</a>
			)}
			{alert.status === 'unknown' && (
				<Button type="button" variant="outline" className="h-11 bg-background px-4 text-foreground" disabled={busy} onClick={onRetry}>Retry save</Button>
			)}
		</div>
	)
}
