'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { changePasswordSchema } from '@recipe-app/contracts/schemas'
import type { ChangePasswordInput } from '@recipe-app/contracts/types'
import { Loader2 } from 'lucide-react'
import { useId, useState, type BaseSyntheticEvent } from 'react'
import { useForm, useFormState, useWatch } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAppToast } from '@/lib/use-app-toast'
import { changePassword } from '../actions/change-password'
import { requestSetPassword } from '../actions/request-set-password'
import { PASSWORD_MESSAGES, SET_PASSWORD_MESSAGES, type ChangePasswordResult, type RequestSetPasswordResult } from '../actions/results'
import { showRefusal } from '../lib/show-refusal'
import { useSingleFlight } from '@/lib/use-single-flight'
import { PasswordField } from './password-field'

type PasswordCardProps = {
	/** From the session read. When a first password is set through the emailed link, the next sign-in renders the change form. */
	hasPassword: boolean
	onChange?: (input: ChangePasswordInput) => Promise<ChangePasswordResult>
	onRequestLink?: () => Promise<RequestSetPasswordResult>
}

const alertClass = 'text-sm font-medium text-destructive wrap-break-word'

/** The Password card: a change form for an Account that has a password, and a way to get a set-password link for one that has none. */
export function PasswordCard({ hasPassword, onChange = changePassword, onRequestLink = requestSetPassword }: PasswordCardProps) {
	const headingId = useId()
	return (
		<section aria-labelledby={headingId} className="max-w-xl">
			<Card className="sm:[--card-spacing:--spacing(5)]">
				<div className="px-(--card-spacing)">
					<h2 id={headingId} className="text-base font-semibold">Password</h2>
					<p className="text-sm text-muted-foreground">
						{hasPassword ? 'Changing it signs out your other devices.' : 'No password yet. We’ll email you a link to create one.'}
					</p>
				</div>
				<CardContent>
					{hasPassword ? <ChangePasswordForm onChange={onChange} /> : <SetPasswordLink onRequestLink={onRequestLink} />}
				</CardContent>
			</Card>
		</section>
	)
}

function ChangePasswordForm({ onChange }: { onChange: NonNullable<PasswordCardProps['onChange']> }) {
	const toast = useAppToast()
	const currentId = useId()
	const newId = useId()
	const [alert, setAlert] = useState<string>()
	const form = useForm<ChangePasswordInput>({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: '', newPassword: '' } })
	// Subscribed state: the form object keeps one identity, so reading form.formState here could be cached by the compiler.
	const { errors } = useFormState({ control: form.control })
	const [currentPassword, newPassword] = useWatch({ control: form.control, name: ['currentPassword', 'newPassword'] })
	const clearAlert = { onChange: () => setAlert(undefined) }

	function showResult(result: ChangePasswordResult) {
		if (result.status === 'changed') {
			toast.success(PASSWORD_MESSAGES.changed)
			// Neither password stays in the page once it has been used.
			form.reset()
			return
		}
		showRefusal(result, { form, toast, setAlert, failed: PASSWORD_MESSAGES.failed })
	}
	const { pending, run } = useSingleFlight(onChange, (): ChangePasswordResult => ({ status: 'failed', message: PASSWORD_MESSAGES.failed }), showResult)

	function send(values: ChangePasswordInput) {
		setAlert(undefined)
		run(values)
	}

	function submit(event?: BaseSyntheticEvent) {
		return form.handleSubmit(send)(event)
	}

	return (
		<form noValidate onSubmit={submit} aria-busy={pending} className="space-y-3">
			<PasswordField
				id={currentId}
				label="Current password"
				error={errors.currentPassword?.message}
				{...form.register('currentPassword', clearAlert)}
				// A value typed while a change is in flight would be cleared with the one that was sent.
				readOnly={pending}
				autoComplete="current-password"
			/>
			<PasswordField
				id={newId}
				label="New password"
				error={errors.newPassword?.message}
				range
				{...form.register('newPassword', clearAlert)}
				readOnly={pending}
				autoComplete="new-password"
				enterKeyHint="done"
			/>
			{alert && <p role="alert" className={alertClass}>{alert}</p>}
			<div className="flex justify-end">
				<Button type="submit" className="h-11 px-4" disabled={pending || !currentPassword || !newPassword}>
					{pending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
					{pending ? 'Changing…' : 'Change password'}
				</Button>
			</div>
		</form>
	)
}

function SetPasswordLink({ onRequestLink }: { onRequestLink: NonNullable<PasswordCardProps['onRequestLink']> }) {
	const toast = useAppToast()
	const [result, setResult] = useState<RequestSetPasswordResult>()
	const { pending, run } = useSingleFlight(onRequestLink, (): RequestSetPasswordResult => ({ status: 'failed', message: SET_PASSWORD_MESSAGES.failed }), (outcome) => {
		setResult(outcome)
		if (outcome.status === 'sent') toast.success(SET_PASSWORD_MESSAGES.sentToast)
		else toast.error(outcome.message)
	})

	function send() {
		setResult(undefined)
		run()
	}

	return (
		<div aria-busy={pending} className="space-y-3">
			{result?.status === 'sent' && <p role="status" className="text-sm text-muted-foreground wrap-break-word">{SET_PASSWORD_MESSAGES.sent}</p>}
			{result && result.status !== 'sent' && <p role="alert" className={alertClass}>{result.message}</p>}
			<div className="flex justify-end">
				<Button type="button" className="h-11 px-4" disabled={pending} onClick={send}>
					{pending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
					{pending ? 'Sending…' : 'Email me a link'}
				</Button>
			</div>
		</div>
	)
}
