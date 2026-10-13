'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { changeEmailSchema } from '@recipe-app/contracts/schemas'
import type { ChangeEmailInput } from '@recipe-app/contracts/types'
import { Loader2 } from 'lucide-react'
import { useId, useRef, useState, useTransition, type BaseSyntheticEvent } from 'react'
import { useForm, useFormState, useWatch } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { FieldError } from '@/features/recipes/form/components/form-field'
import { fieldA11y, inputClass } from '@/features/recipes/form/lib/field-props'
import { useAppToast } from '@/lib/use-app-toast'
import { cn } from '@/lib/utils'
import { changeEmail } from '../actions/change-email'
import { cancelEmailChange, resendEmailChange } from '../actions/pending-email-change'
import { EMAIL_MESSAGES, type ChangeEmailResult, type PendingEmailChangeResult } from '../actions/results'
import { PasswordField } from './password-field'

type EmailCardProps = {
	/** The Account's Verified email, from the session read. It changes only when the emailed link is confirmed. */
	email: string
	/** The address a change is waiting on, if any. A refresh after each action brings the current one. */
	pendingEmail: string | null
	/** Changing the email takes the current password, so an Account without one sees the reason and no form. */
	hasPassword: boolean
	onChange?: (input: ChangeEmailInput) => Promise<ChangeEmailResult>
	onResend?: () => Promise<PendingEmailChangeResult>
	onCancel?: () => Promise<PendingEmailChangeResult>
}

const alertClass = 'text-sm font-medium text-destructive wrap-break-word'

/** The Email card: the current address, a banner while a change waits on its link, and the form that starts a change. */
export function EmailCard({ email, pendingEmail, hasPassword, onChange = changeEmail, onResend = resendEmailChange, onCancel = cancelEmailChange }: EmailCardProps) {
	const headingId = useId()
	const currentId = useId()
	return (
		<section aria-labelledby={headingId} className="max-w-xl">
			<Card className="sm:[--card-spacing:--spacing(5)]">
				<div className="px-(--card-spacing)">
					<h2 id={headingId} className="text-base font-semibold">Email</h2>
					<p className="text-sm text-muted-foreground">Sign-in and recovery address.</p>
				</div>
				<CardContent className="space-y-3">
					{pendingEmail && <PendingChange pendingEmail={pendingEmail} onResend={onResend} onCancel={onCancel} />}
					<div className="space-y-1.5">
						<label htmlFor={currentId} className="text-sm font-medium">Current email</label>
						<div className="relative">
							<Input id={currentId} value={email} readOnly aria-describedby={`${currentId}-verified`} className={cn(inputClass, 'bg-muted pr-24 text-muted-foreground')} />
							<Badge id={`${currentId}-verified`} variant="secondary" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2">Verified</Badge>
						</div>
					</div>
					{hasPassword
						? <ChangeEmailForm email={email} onChange={onChange} />
						: <p className="text-sm text-muted-foreground">{EMAIL_MESSAGES.passwordRequired}</p>}
				</CardContent>
			</Card>
		</section>
	)
}

type PendingChangeProps = { pendingEmail: string } & Required<Pick<EmailCardProps, 'onResend' | 'onCancel'>>

const BANNER_ACTIONS = {
	resend: { label: 'Resend', busy: 'Sending…', failed: EMAIL_MESSAGES.failed, done: EMAIL_MESSAGES.resent },
	cancel: { label: 'Cancel', busy: 'Cancelling…', failed: EMAIL_MESSAGES.cancelFailed, done: EMAIL_MESSAGES.cancelled },
} as const

type BannerAction = keyof typeof BANNER_ACTIONS

/** Shown until the link is confirmed or the change is cancelled; the refreshed session read then carries no pending address. */
function PendingChange({ pendingEmail, onResend, onCancel }: PendingChangeProps) {
	const toast = useAppToast()
	const [, startTransition] = useTransition()
	const [running, setRunning] = useState<BannerAction>()
	const inFlight = useRef(false)
	const [alert, setAlert] = useState<string>()

	function run(action: BannerAction) {
		if (inFlight.current) return
		inFlight.current = true
		setAlert(undefined)
		setRunning(action)
		const { failed, done } = BANNER_ACTIONS[action]
		startTransition(async () => {
			let result: PendingEmailChangeResult
			try { result = await (action === 'resend' ? onResend : onCancel)() } catch { result = { status: 'failed', message: failed } }
			inFlight.current = false
			setRunning(undefined)
			if (result.status === 'resent' || result.status === 'cancelled') {
				toast.success(done)
				return
			}
			toast.error(result.message)
			setAlert(result.message)
		})
	}

	return (
		<div className="space-y-3">
			<Alert role="status" aria-busy={running !== undefined} className="border-amber-300 bg-amber-50 text-foreground dark:border-amber-900 dark:bg-amber-950">
				<AlertDescription className="text-foreground wrap-anywhere">
					We sent a link to <strong className="font-semibold">{pendingEmail}</strong>. Your email changes once you open it.
				</AlertDescription>
				<div className="-mx-1.5 flex flex-wrap gap-1">
					{(['resend', 'cancel'] as const).map((action) => (
						<Button key={action} type="button" variant="ghost" className="h-11 px-3 underline underline-offset-3" disabled={running !== undefined} onClick={() => run(action)}>
							{running === action && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
							{running === action ? BANNER_ACTIONS[action].busy : BANNER_ACTIONS[action].label}
						</Button>
					))}
				</div>
			</Alert>
			{alert && <p role="alert" className={alertClass}>{alert}</p>}
		</div>
	)
}

function ChangeEmailForm({ email, onChange }: { email: string; onChange: NonNullable<EmailCardProps['onChange']> }) {
	const toast = useAppToast()
	const newEmailId = useId()
	const passwordId = useId()
	const [pending, startTransition] = useTransition()
	const inFlight = useRef(false)
	const [alert, setAlert] = useState<string>()
	const form = useForm<ChangeEmailInput>({ resolver: zodResolver(changeEmailSchema), defaultValues: { newEmail: '', currentPassword: '' } })
	// Subscribed state: the form object keeps one identity, so reading form.formState here could be cached by the compiler.
	const { errors } = useFormState({ control: form.control })
	const [newEmail, currentPassword] = useWatch({ control: form.control, name: ['newEmail', 'currentPassword'] })
	const clearAlert = { onChange: () => setAlert(undefined) }
	const newEmailError = errors.newEmail?.message

	function showResult(result: ChangeEmailResult) {
		if (result.status === 'sent') {
			toast.success(EMAIL_MESSAGES.sent)
			// Neither the address nor the password stays in the form: the banner names the address from here on.
			form.reset()
			return
		}
		toast.error(result.status === 'invalid' ? EMAIL_MESSAGES.failed : result.message)
		if (result.status === 'invalid') form.setError(result.field, { type: 'server', message: result.message }, { shouldFocus: true })
		else setAlert(result.message)
	}

	/** `values` come out of the shared schema, so the new email is already in its stored form. */
	function send(values: ChangeEmailInput) {
		if (inFlight.current) return
		if (values.newEmail === email) {
			form.setError('newEmail', { type: 'validate', message: EMAIL_MESSAGES.unchanged }, { shouldFocus: true })
			return
		}
		inFlight.current = true
		setAlert(undefined)
		startTransition(async () => {
			let result: ChangeEmailResult
			try { result = await onChange(values) } catch { result = { status: 'failed', message: EMAIL_MESSAGES.failed } }
			inFlight.current = false
			showResult(result)
		})
	}

	function submit(event?: BaseSyntheticEvent) {
		return form.handleSubmit(send)(event)
	}

	return (
		<form noValidate onSubmit={submit} aria-busy={pending} className="space-y-3">
			<div className="space-y-1.5">
				<label htmlFor={newEmailId} className="text-sm font-medium">New email</label>
				<Input
					{...fieldA11y(newEmailId, newEmailError)}
					{...form.register('newEmail', clearAlert)}
					type="email"
					className={inputClass}
					// A value typed while a request is in flight would be cleared with the one that was sent.
					readOnly={pending}
					autoComplete="email"
					autoCapitalize="none"
					spellCheck={false}
				/>
				{newEmailError && <FieldError id={`${newEmailId}-error`}>{newEmailError}</FieldError>}
			</div>
			<PasswordField
				id={passwordId}
				label="Current password"
				error={errors.currentPassword?.message}
				{...form.register('currentPassword', clearAlert)}
				readOnly={pending}
				autoComplete="current-password"
				enterKeyHint="done"
			/>
			{alert && <p role="alert" className={alertClass}>{alert}</p>}
			<div className="flex justify-end">
				<Button type="submit" className="h-11 px-4" disabled={pending || !newEmail || !currentPassword}>
					{pending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
					{pending ? 'Sending…' : 'Send verification link'}
				</Button>
			</div>
		</form>
	)
}
