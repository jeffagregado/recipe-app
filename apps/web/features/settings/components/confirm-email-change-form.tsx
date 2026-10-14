'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { confirmEmailChange } from '../actions/confirm-email-change'
import { CONFIRM_EMAIL_MESSAGES, type ConfirmEmailChangeResult } from '../actions/results'
import { useSingleFlight } from '@/lib/use-single-flight'

type ConfirmEmailChangeFormProps = {
	token?: string
	onConfirm?: (input: { token: string }) => Promise<ConfirmEmailChangeResult>
}

/**
 * The page behind the emailed email-change link. Rendering it calls nothing: the token is sent, and used up, only when
 * the button is pressed, so a mail scanner that opens the link can neither complete nor burn the change. A link without
 * a token, or one the API refuses, shows the expired state with the way back to Settings.
 */
export function ConfirmEmailChangeForm({ token, onConfirm = confirmEmailChange }: ConfirmEmailChangeFormProps) {
	const [expired, setExpired] = useState(false)
	const [message, setMessage] = useState<string>()
	// A confirmed change redirects, so only refusals ever settle here.
	const { pending, run } = useSingleFlight(onConfirm, (): ConfirmEmailChangeResult => ({ status: 'failed', message: CONFIRM_EMAIL_MESSAGES.failed }), (result) => {
		if (result.status === 'invalid') setExpired(true)
		else setMessage(result.message)
	})

	if (!token || expired) {
		return (
			<div className="space-y-4">
				<p role="alert" className="text-sm wrap-break-word">This link has expired or was already used.</p>
				<Link href="/settings" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11 w-full')}>Back to Settings</Link>
			</div>
		)
	}
	const link = token

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setMessage(undefined)
		run({ token: link })
	}

	return (
		<form method="post" noValidate onSubmit={submit} aria-busy={pending} className="space-y-5">
			{message && <p role="alert" className="text-sm text-destructive wrap-break-word">{message}</p>}
			<Button type="submit" className="min-h-11 w-full" disabled={pending}><span aria-live="polite">{pending ? 'Confirming…' : 'Confirm email change'}</span></Button>
		</form>
	)
}
