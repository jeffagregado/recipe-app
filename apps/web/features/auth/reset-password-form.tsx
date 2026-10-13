'use client'

import { passwordSchema } from '@recipe-app/contracts/schemas'
import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { resetPassword } from './actions'
import { AuthField } from './auth-field'
import { ResetLinkExpired } from './reset-link-expired'
import { submitAuth } from './submit-auth'

/**
 * The form behind the emailed reset link. Rendering it calls nothing: the token is sent, and used up, only on submit. A
 * link without a token, or one the API refuses, shows the expired state instead.
 */
export function ResetPasswordForm({ token }: { token?: string }) {
	const fieldId = `${useId()}-password`
	const input = useRef<HTMLInputElement>(null)
	const [password, setPassword] = useState('')
	const [showPassword, setShowPassword] = useState(false)
	const [fieldError, setFieldError] = useState<string>()
	const [message, setMessage] = useState<string>()
	const [pending, startTransition] = useTransition()
	const [expired, setExpired] = useState(false)
	const toggleText = showPassword ? 'Hide' : 'Show'
	if (!token || expired) return <ResetLinkExpired />

	async function update() {
		const result = await submitAuth(() => resetPassword({ token, password }), 'reset-password', () => setPassword(''))
		if (result.code === 'RESET_LINK_INVALID') { setPassword(''); setExpired(true); return }
		const error = result.fieldErrors?.password?.[0]
		if (error) { setFieldError(error); input.current?.focus() }
		else setMessage(result.message)
	}

	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		if (pending) return
		setFieldError(undefined)
		setMessage(undefined)
		const parsed = passwordSchema.safeParse(password)
		if (!parsed.success) {
			setFieldError(parsed.error.issues[0].message)
			input.current?.focus()
			return
		}
		startTransition(update)
	}

	return (
		<form method="post" noValidate onSubmit={submit} aria-busy={pending} className="space-y-5">
			<AuthField ref={input} id={fieldId} name="password" label="New password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" guidance="12-128 characters" className="min-h-11 pr-20" error={fieldError} value={password} onChange={(event) => setPassword(event.target.value)}>
				<Button type="button" variant="ghost" className="absolute inset-y-0 right-0 min-h-11 min-w-16" aria-label={`${toggleText} password`} aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)}>{toggleText}</Button>
			</AuthField>
			{message && <p role="alert" className="text-sm text-destructive wrap-break-word">{message}</p>}
			<Button type="submit" className="min-h-11 w-full" disabled={pending}><span aria-live="polite">{pending ? 'Updating password...' : 'Update password'}</span></Button>
		</form>
	)
}
