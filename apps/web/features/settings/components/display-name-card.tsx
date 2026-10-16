'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { updateDisplayNameSchema } from '@recipe-app/contracts/schemas'
import type { UpdateDisplayNameInput } from '@recipe-app/contracts/types'
import { Loader2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, useTransition, type BaseSyntheticEvent } from 'react'
import { useForm, useFormState, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { SettingsSection } from './settings-section'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/features/recipes/form/components/form-field'
import { fieldA11y, inputClass } from '@/features/recipes/form/lib/field-props'
import { useAppToast } from '@/lib/use-app-toast'
import { cn } from '@/lib/utils'
import { DISPLAY_NAME_MESSAGES, type UpdateDisplayNameResult } from '../actions/results'
import { updateDisplayName } from '../actions/update-display-name'
import { displayNameLength, isDisplayNameChanged, MAX_DISPLAY_NAME_LENGTH } from '../lib/display-name-form'

type DisplayNameCardProps = {
	/** The stored name. When it changes (a save here, or one made elsewhere) the card adopts it and has nothing to save. */
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
	const [stored, setStored] = useState(displayName)
	const [alert, setAlert] = useState<string>()
	const form = useForm<UpdateDisplayNameInput>({ resolver: zodResolver(updateDisplayNameSchema), defaultValues: { displayName } })
	// The card stays mounted across refreshes so focus stays in the field; a new stored name replaces what the card holds.
	if (stored !== displayName) {
		setStored(displayName)
		setSaved(displayName)
	}
	useEffect(() => { form.setValue('displayName', displayName) }, [form, displayName])
	// Subscribed state: the form object keeps one identity, so reading form.formState here could be cached by the compiler.
	const { errors } = useFormState({ control: form.control })
	const value = useWatch({ control: form.control, name: 'displayName' })
	const error = errors.displayName?.message

	function showResult(result: UpdateDisplayNameResult) {
		if (result.status === 'saved') {
			toast.success(DISPLAY_NAME_MESSAGES.saved)
			// The refreshed page passes the stored name down; until then the saved name is the clean state.
			setSaved(result.displayName)
			form.setValue('displayName', result.displayName)
			return
		}
		toast.error(result.status === 'invalid' ? DISPLAY_NAME_MESSAGES.failed : result.message)
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
		// Below lg there is no sidebar, so the description would name something the person cannot see.
		<SettingsSection headingId={headingId} title="Display name" description="Shown in the sidebar." descriptionClassName="hidden lg:block">
					<form noValidate onSubmit={submit} aria-busy={pending} className="space-y-3">
						<div className="space-y-1.5">
							<div className="relative">
								<Input
									{...fieldA11y(fieldId, error)}
									{...form.register('displayName', { onChange: () => setAlert(undefined) })}
									className={cn(inputClass, 'sm:pr-16')}
									aria-labelledby={headingId}
									// A name typed while a save is in flight would be replaced by the saved one.
									readOnly={pending}
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
		</SettingsSection>
	)
}
