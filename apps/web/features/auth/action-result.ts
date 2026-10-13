import { authErrorResponseSchema } from '@recipe-app/contracts/schemas'
import type { AuthErrorResponse } from '@recipe-app/contracts/types'

export type AuthFailure = { ok: false } & AuthErrorResponse
export type LogoutResult = { ok: true } | AuthFailure
export type AuthMutation = 'signup' | 'login' | 'logout'

const INVALID_LOGIN: AuthFailure = { ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }

/** Login never tells the browser why it failed; the cause stays in the web server log. */
export function publicFailure(operation: AuthMutation, cause: AuthFailure): AuthFailure {
	return operation === 'login' ? INVALID_LOGIN : cause
}

export function serviceFailure(operation: AuthMutation): AuthFailure {
	return { ok: false, code: 'SERVICE_UNAVAILABLE', message: operation === 'signup'
		? 'We could not confirm signup. Your account may have been created; try logging in with your email. Do not submit signup again automatically.'
		: operation === 'logout' ? 'Could not confirm logout. Please try again.' : 'Authentication is unavailable. Please try again.' }
}

export function mapAuthError(status: number, payload: unknown, operation: AuthMutation = 'login'): AuthFailure {
	const parsed = authErrorResponseSchema.safeParse(payload)
	if (!parsed.success) return serviceFailure(operation)
	if (status === 401 && parsed.data.code === 'INVALID_CREDENTIALS') return INVALID_LOGIN
	if (status === 409 && parsed.data.code === 'EMAIL_ALREADY_EXISTS') return { ok: false, code: 'EMAIL_ALREADY_EXISTS', message: 'Email already exists.', fieldErrors: { email: ['Email already exists.'] } }
	if (status === 429) return { ok: false, code: 'RATE_LIMITED', message: 'Too many attempts. Please wait and try again.' }
	if (status === 403) return { ok: false, code: 'ORIGIN_REJECTED', message: 'This request could not be verified. Refresh the page and try again.' }
	if (status === 413) return { ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'This request is too large. Check the form and try again.' }
	if (status === 400 && parsed.data.code === 'VALIDATION_FAILED') return { ok: false, code: 'VALIDATION_FAILED', message: 'Check your details and try again.' }
	return serviceFailure(operation)
}
