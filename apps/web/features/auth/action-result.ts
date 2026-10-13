import { authErrorResponseSchema } from '@recipe-app/contracts/schemas'
import type { AuthErrorResponse } from '@recipe-app/contracts/types'

export type AuthFailure = { ok: false } & AuthErrorResponse
export type LogoutResult = { ok: true } | AuthFailure
export type ResendVerificationResult = { ok: true } | AuthFailure
export type ForgotPasswordResult = { ok: true } | AuthFailure
export type AuthMutation = 'signup' | 'login' | 'logout' | 'resend-verification' | 'forgot-password' | 'reset-password'

/** The one answer the browser gets when a Google sign-in cannot start; the cause stays in the web server log. */
export const GOOGLE_UNAVAILABLE: AuthFailure = { ok: false, code: 'GOOGLE_SIGN_IN_FAILED', message: 'Google sign-in is unavailable. Please try again.' }

const INVALID_LOGIN: AuthFailure = { ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
/** One answer for an expired, used, unknown and malformed reset token. */
export const RESET_LINK_INVALID: AuthFailure = { ok: false, code: 'RESET_LINK_INVALID', message: 'This link has expired or was already used.' }

const SERVICE_MESSAGES: Record<AuthMutation, string> = {
	signup: 'We could not confirm signup. Your account may have been created; try logging in with your email. Do not submit signup again automatically.',
	login: 'Authentication is unavailable. Please try again.',
	logout: 'Could not confirm logout. Please try again.',
	'resend-verification': 'We could not send the email. Please try again.',
	'forgot-password': 'We could not send the email. Please try again.',
	'reset-password': 'We could not update your password. Please try again.',
}

/**
 * Login never tells the browser why it failed; the cause stays in the web server log. The one exception is an unverified
 * email: the API answers it only after a correct password, which already proved who is asking.
 */
export function publicFailure(operation: AuthMutation, cause: AuthFailure): AuthFailure {
	return operation === 'login' && cause.code !== 'EMAIL_NOT_VERIFIED' ? INVALID_LOGIN : cause
}

export function serviceFailure(operation: AuthMutation): AuthFailure {
	return { ok: false, code: 'SERVICE_UNAVAILABLE', message: SERVICE_MESSAGES[operation] }
}

function rateLimitMessage(operation: AuthMutation): string {
	return ['resend-verification', 'forgot-password'].includes(operation) ? 'You asked for too many emails. Please try again later.' : 'Too many attempts. Please wait and try again.'
}

export function mapAuthError(status: number, payload: unknown, operation: AuthMutation = 'login'): AuthFailure {
	const parsed = authErrorResponseSchema.safeParse(payload)
	if (!parsed.success) return serviceFailure(operation)
	if (status === 400 && parsed.data.code === 'RESET_LINK_INVALID') return RESET_LINK_INVALID
	if (status === 401 && parsed.data.code === 'INVALID_CREDENTIALS') return INVALID_LOGIN
	if (status === 409 && parsed.data.code === 'EMAIL_ALREADY_EXISTS') return { ok: false, code: 'EMAIL_ALREADY_EXISTS', message: 'Email already exists.', fieldErrors: { email: ['Email already exists.'] } }
	if (status === 429) return { ok: false, code: 'RATE_LIMITED', message: rateLimitMessage(operation) }
	// Checked before the generic 403: only this code says the password was right.
	if (status === 403 && parsed.data.code === 'EMAIL_NOT_VERIFIED') return { ok: false, code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before logging in.' }
	if (status === 403) return { ok: false, code: 'ORIGIN_REJECTED', message: 'This request could not be verified. Refresh the page and try again.' }
	if (status === 413) return { ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'This request is too large. Check the form and try again.' }
	if (status === 400 && parsed.data.code === 'VALIDATION_FAILED') return { ok: false, code: 'VALIDATION_FAILED', message: 'Check your details and try again.' }
	return serviceFailure(operation)
}
