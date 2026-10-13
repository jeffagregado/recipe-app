'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { changeEmailSchema } from '@recipe-app/contracts/schemas'
import type { ChangeEmailInput } from '@recipe-app/contracts/types'
import { Loader2 } from 'lucide-react'
import { useId, useState, type BaseSyntheticEvent } from 'react'
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
import { showRefusal } from '../lib/show-refusal'
import { useSingleFlight } from '../lib/use-single-flight'
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
						? <ChangeEmailForm onChange={onChange} />
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
	const [running, setRunning] = useState<BannerAction>()
	const [alert, setAlert] = useState<string>()
	const { run } = useSingleFlight(
		(action: BannerAction) => (action === 'resend' ? onResend : onCancel)(),
		(action): PendingEmailChangeResult => ({ status: 'failed', message: BANNER_ACTIONS[action].failed }),
		(result, action) => {
			setRunning(undefined)
			if (result.status === 'resent' || result.status === 'cancelled') {
				toast.success(BANNER_ACTIONS[action].done)
				return
			}
			toast.error(result.message)
			setAlert(result.message)
		},
	)

	/** Both buttons are held while either action runs, so the hook never has a second call to drop. */
	function start(action: BannerAction) {
		setAlert(undefined)
		setRunning(action)
		run(action)
	}

	return (
		<div className="space-y-3">
			{/* A group, not the Alert's default role: the buttons are not part of what is announced. */}
			<Alert role="group" aria-label="Pending email change" aria-busy={running !== undefined} className="border-warning/50 bg-warning/10">
				<AlertDescription role="status" className="text-foreground wrap-anywhere">
					We sent a link to <strong className="font-semibold">{pendingEmail}</strong>. Your email changes once you open it.
				</AlertDescription>
				<div className="-mx-1.5 flex flex-wrap gap-1">
					{(['resend', 'cancel'] as const).map((action) => (
						<Button key={action} type="button" variant="ghost" className="h-11 px-3 underline underline-offset-3" disabled={running !== undefined} onClick={() => start(action)}>
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

function ChangeEmailForm({ onChange }: { onChange: NonNullable<EmailCardProps['onChange']> }) {
	const toast = useAppToast()
	const newEmailId = useId()
	const passwordId = useId()
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
		showRefusal(result, { form, toast, setAlert, failed: EMAIL_MESSAGES.failed })
	}
	const { pending, run } = useSingleFlight(onChange, (): ChangeEmailResult => ({ status: 'failed', message: EMAIL_MESSAGES.failed }), showResult)

	function send(values: ChangeEmailInput) {
		setAlert(undefined)
		run(values)
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
