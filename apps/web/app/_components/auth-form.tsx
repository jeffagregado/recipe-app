'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { AuthField } from '@/features/auth/auth-field'
import { ResendVerification } from '@/features/auth/resend-verification'
import { useAuthForm } from './use-auth-form'

type ModeSwitchProps = { isSignup: boolean; pending: boolean; onSwitch: (mode: 'login' | 'signup') => void }

function ModeSwitch({ isSignup, pending, onSwitch }: ModeSwitchProps) {
	return <div role="group" aria-label="Authentication mode" className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
		<Button className="min-h-11" type="button" variant={isSignup ? 'ghost' : 'default'} aria-pressed={!isSignup} disabled={pending} onClick={() => onSwitch('login')}>Login</Button>
		<Button className="min-h-11" type="button" variant={isSignup ? 'default' : 'ghost'} aria-pressed={isSignup} disabled={pending} onClick={() => onSwitch('signup')}>Sign up</Button>
	</div>
}

function submitLabel(isSignup: boolean, pending: boolean) {
	if (isSignup) return pending ? 'Signing up...' : 'Sign up'
	return pending ? 'Logging in...' : 'Log in'
}

export function AuthForm() {
	const { isSignup, pending, showPassword, setShowPassword, message, unverifiedEmail, errors, register, switchMode, submit } = useAuthForm()
	const label = submitLabel(isSignup, pending)
	return <div className="space-y-6">
		<ModeSwitch isSignup={isSignup} pending={pending} onSwitch={switchMode} />
		<form method="post" noValidate onSubmit={submit} aria-busy={pending} className="space-y-5">
			{isSignup && <AuthField id="displayName" label="Display Name" autoComplete="name" className="min-h-11" error={errors.displayName?.message} {...register('displayName')} />}
			<AuthField id="email" label="Email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} className="min-h-11" error={errors.email?.message} {...register('email')} />
			<AuthField id="password" label="Password" type={showPassword ? 'text' : 'password'} autoComplete={isSignup ? 'new-password' : 'current-password'} className="min-h-11 pr-20" error={errors.password?.message} guidance={isSignup ? '12-128 characters' : undefined} {...register('password')}>
				<Button type="button" variant="ghost" className="absolute inset-y-0 right-0 min-h-11 min-w-16" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Hide' : 'Show'}</Button>
			</AuthField>
			{!isSignup && <Link href="/forgot-password" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Forgot password?</Link>}
			{message && <p role="alert" className="text-sm text-destructive wrap-break-word">{message}</p>}
			{unverifiedEmail && <ResendVerification key={unverifiedEmail} email={unverifiedEmail} />}
			<Button type="submit" className="min-h-11 w-full" disabled={pending}><span aria-live="polite">{label}</span></Button>
		</form>
	</div>
}
