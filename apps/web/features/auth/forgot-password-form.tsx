'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { serviceFailure, type AuthFailure, type ForgotPasswordResult } from './action-result'
import { forgotPassword } from './actions'
import { AuthField } from './auth-field'

/** Asks for a reset link. The confirmation is the same for every address, so it never says whether an Account exists. */
export function ForgotPasswordForm() {
	const fieldId = `${useId()}-email`
	const input = useRef<HTMLInputElement>(null)
	const [email, setEmail] = useState('')
	const [sent, setSent] = useState(false)
	const [failure, setFailure] = useState<AuthFailure>()
	const [pending, startTransition] = useTransition()
	const fieldError = failure?.fieldErrors?.email?.[0]

	function send() {
		if (pending) return
		setFailure(undefined)
		startTransition(async () => {
			let result: ForgotPasswordResult
			try { result = await forgotPassword({ email }) } catch { result = serviceFailure('forgot-password') }
			if (result.ok) setSent(true)
			else {
				setFailure(result)
				if (result.fieldErrors?.email) input.current?.focus()
			}
		})
	}

	if (sent) return <p role="status" className="text-sm text-muted-foreground wrap-break-word">If an Account exists for that address, we sent a link to reset its password. The link expires in one hour.</p>
	return (
		<form method="post" noValidate onSubmit={(event) => { event.preventDefault(); send() }} aria-busy={pending} className="space-y-4">
			<AuthField ref={input} id={fieldId} name="email" label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} className="min-h-11" error={fieldError} value={email} onChange={(event) => setEmail(event.target.value)} />
			{failure && !fieldError && <p role="alert" className="text-sm text-destructive wrap-break-word">{failure.message}</p>}
			<Button type="submit" className="min-h-11 w-full" disabled={pending}>Send reset link</Button>
		</form>
	)
}
