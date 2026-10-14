'use client'

import { unstable_rethrow } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { verifyEmail } from './verify-email'

type VerifyEmailFormProps = {
	token?: string
	onVerify?: (input: { token: string }) => Promise<never>
}

/**
 * The page behind the emailed verification link. Rendering it calls nothing: the token is sent, and used up, only when
 * the button is pressed, so a mail scanner that opens the link cannot spend it. Every answer redirects; a link without a
 * token is sent as it is, for the action to refuse.
 */
export function VerifyEmailForm({ token = '', onVerify = verifyEmail }: VerifyEmailFormProps) {
	const [message, setMessage] = useState<string>()
	const [pending, startTransition] = useTransition()

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (pending) return
		setMessage(undefined)
		startTransition(async () => {
			try { await onVerify({ token }) } catch (error) {
				unstable_rethrow(error)
				setMessage('We could not verify your email. Please try again.')
			}
		})
	}

	return (
		<form method="post" noValidate onSubmit={submit} aria-busy={pending} className="space-y-5">
			{message && <p role="alert" className="text-sm text-destructive wrap-break-word">{message}</p>}
			<Button type="submit" className="min-h-11 w-full" disabled={pending}><span aria-live="polite">{pending ? 'Verifying…' : 'Verify my email'}</span></Button>
		</form>
	)
}
