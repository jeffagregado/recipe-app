'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { serviceFailure, type ResendVerificationResult } from './action-result'
import { resendVerification } from './actions'
import { AuthField } from './auth-field'

type ResendVerificationProps = {
	/** The address to resend to. Without it the control asks for one. */
	email?: string
}

/**
 * Asks for a new verification link and reports the answer inline. With a bound address it is a single button, so it can
 * sit inside another form; without one it is its own small form.
 */
export function ResendVerification({ email }: ResendVerificationProps) {
	const fieldId = `${useId()}-email`
	const input = useRef<HTMLInputElement>(null)
	// Controlled, so the form action does not clear an address the server rejected.
	const [typed, setTyped] = useState('')
	const [pending, startTransition] = useTransition()
	const [result, setResult] = useState<ResendVerificationResult>()
	const fieldError = result?.ok === false ? result.fieldErrors?.email?.[0] : undefined

	function send() {
		if (pending) return
		setResult(undefined)
		startTransition(async () => {
			let next: ResendVerificationResult
			try { next = await resendVerification({ email: email ?? typed }) } catch { next = serviceFailure('resend-verification') }
			setResult(next)
			if (!next.ok && next.fieldErrors?.email) input.current?.focus()
		})
	}

	return (
		<div className="space-y-3">
			{email === undefined ? (
				<form noValidate action={send} aria-busy={pending} className="space-y-4">
					<AuthField ref={input} id={fieldId} name="email" label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} className="min-h-11" error={fieldError} value={typed} onChange={(event) => setTyped(event.target.value)} />
					<Button type="submit" variant="outline" className="min-h-11 w-full" disabled={pending}>Resend verification email</Button>
				</form>
			) : (
				<Button type="button" variant="outline" className="min-h-11 w-full" disabled={pending} onClick={send}>Resend verification email</Button>
			)}
			{result?.ok && <p role="status" className="text-sm text-muted-foreground wrap-break-word">If that address needs verifying, we sent a new link.</p>}
			{result?.ok === false && !fieldError && <p role="alert" className="text-sm text-destructive wrap-break-word">{result.message}</p>}
		</div>
	)
}
