'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { updateDisplayNameSchema } from '@recipe-app/contracts/schemas'
import type { UpdateDisplayNameInput } from '@recipe-app/contracts/types'
import { Loader2 } from 'lucide-react'
import { useId, useRef, useState, useTransition, type BaseSyntheticEvent } from 'react'
import { useForm, useFormState, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/features/recipes/form/components/form-field'
import { fieldA11y, inputClass } from '@/features/recipes/form/lib/field-props'
import { useAppToast } from '@/lib/use-app-toast'
import { cn } from '@/lib/utils'
import { DISPLAY_NAME_MESSAGES, type UpdateDisplayNameResult } from '../actions/results'
import { updateDisplayName } from '../actions/update-display-name'
import { displayNameLength, isDisplayNameChanged, MAX_DISPLAY_NAME_LENGTH } from '../lib/display-name-form'

type DisplayNameCardProps = {
	/** The stored name this card opens with. Mount with a `key` that changes when it does, so a saved card starts clean. */
	displayName: string
	onSave?: (input: UpdateDisplayNameInput) => Promise<UpdateDisplayNameResult>
}

/** The first Settings card: its own form and its own Save, which stays disabled until the name differs from the stored one. */
export function DisplayNameCard({ displayName, onSave = updateDisplayName }: DisplayNameCardProps) {
	const toast = useAppToast()
	const headingId = useId()
	const fieldId = useId()
	const [pending, startTransition] = useTransition()
	const inFlight = useRef(false)
	const [saved, setSaved] = useState(displayName)
	const [alert, setAlert] = useState<string>()
	const form = useForm<UpdateDisplayNameInput>({ resolver: zodResolver(updateDisplayNameSchema), defaultValues: { displayName } })
	// Subscribed state: the form object keeps one identity, so reading form.formState here could be cached by the compiler.
	const { errors } = useFormState({ control: form.control })
	const value = useWatch({ control: form.control, name: 'displayName' })
	const error = errors.displayName?.message

	function showResult(result: UpdateDisplayNameResult) {
		if (result.status === 'saved') {
			toast.success(DISPLAY_NAME_MESSAGES.saved)
			// The refreshed page remounts the card with the stored name; until then the saved name is the clean state.
			setSaved(result.displayName)
			form.setValue('displayName', result.displayName)
			return
		}
		toast.error(result.status === 'session-expired' ? result.message : DISPLAY_NAME_MESSAGES.failed)
		if (result.status === 'invalid') form.setError('displayName', { type: 'server', message: result.message }, { shouldFocus: true })
		else setAlert(result.message)
	}

	function send(values: UpdateDisplayNameInput) {
		if (inFlight.current) return
		inFlight.current = true
		setAlert(undefined)
		startTransition(async () => {
			let result: UpdateDisplayNameResult
			try { result = await onSave(values) } catch { result = { status: 'failed', message: DISPLAY_NAME_MESSAGES.failed } }
			inFlight.current = false
			showResult(result)
		})
	}

	function submit(event?: BaseSyntheticEvent) {
		return form.handleSubmit(send)(event)
	}

	return (
		<section aria-labelledby={headingId} className="max-w-xl">
			<Card className="sm:[--card-spacing:--spacing(5)]">
				<div className="px-(--card-spacing)">
					<h2 id={headingId} className="text-base font-semibold">Display name</h2>
					{/* Below lg there is no sidebar, so the line would describe something the person cannot see. */}
					<p className="text-sm text-muted-foreground max-lg:hidden">Shown in the sidebar.</p>
				</div>
				<CardContent>
					<form noValidate onSubmit={submit} aria-busy={pending} aria-label="Display name" className="space-y-3">
						<div className="space-y-1.5">
							<div className="relative">
								<Input
									{...fieldA11y(fieldId, error)}
									{...form.register('displayName', { onChange: () => setAlert(undefined) })}
									className={cn(inputClass, 'sm:pr-16')}
									aria-label="Display name"
									autoComplete="name"
									enterKeyHint="done"
								/>
								<span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 text-xs text-muted-foreground tabular-nums sm:block">
									{displayNameLength(value)}/{MAX_DISPLAY_NAME_LENGTH}
								</span>
							</div>
							{error && <FieldError id={`${fieldId}-error`}>{error}</FieldError>}
						</div>
						{alert && <p role="alert" className="text-sm font-medium text-destructive wrap-break-word">{alert}</p>}
						<div className="flex justify-end">
							<Button type="submit" className="h-11 px-4" disabled={pending || !isDisplayNameChanged(value, saved)}>
								{pending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
								{pending ? 'Saving…' : 'Save name'}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</section>
	)
}
