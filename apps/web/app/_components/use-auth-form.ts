'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { loginSchema, signupSchema } from '@recipe-app/contracts/schemas'
import type { SignupInput } from '@recipe-app/contracts/types'
import { useState, useTransition } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { login, signup } from '@/features/auth/actions'
import { broadcastAuth } from '@/features/auth/session-client'
import { submitAuth } from '@/features/auth/submit-auth'

type Mode = 'login' | 'signup'

export function useAuthForm() {
	const [mode, setMode] = useState<Mode>('login')
	const [showPassword, setShowPassword] = useState(false)
	const [message, setMessage] = useState<string>()
	const [pending, startTransition] = useTransition()
	const isSignup = mode === 'signup'
	const resolver: Resolver<SignupInput> = async (values, context, options) => {
		if (isSignup) return zodResolver(signupSchema)(values, context, options)
		const result = await zodResolver(loginSchema)({ username: values.username, password: values.password }, context, { ...options, names: ['username', 'password'] })
		if (Object.keys(result.errors).length > 0) return { values: {}, errors: result.errors }
		return { values: { ...values, ...result.values }, errors: {} }
	}
	const { register, handleSubmit, resetField, clearErrors, setError, formState: { errors } } = useForm<SignupInput>({
		resolver, defaultValues: { displayName: '', username: '', password: '' }, shouldFocusError: true,
	})

	function switchMode(next: Mode) {
		if (next === mode || pending) return
		// reset() discards registered field refs, which the React Compiler keeps memoized.
		resetField('password')
		clearErrors()
		setMessage(undefined)
		setShowPassword(false)
		setMode(next)
	}

	const submit = handleSubmit((values) => {
		if (pending) return
		setMessage(undefined)
		startTransition(async () => {
			const result = await submitAuth(() => isSignup ? signup(values) : login({ username: values.username, password: values.password }), mode, () => {
				resetField('password')
				broadcastAuth('login')
			})
			setMessage(result.message)
			for (const field of ['displayName', 'username', 'password'] as const) {
				const error = result.fieldErrors?.[field]?.[0]
				if (error) { setError(field, { type: 'server', message: error }, { shouldFocus: true }); break }
			}
		})
	})

	return { mode, isSignup, pending, showPassword, setShowPassword, message, errors, register, switchMode, submit }
}

