import { describe, expect, it } from 'vitest'
import { mapAuthError, publicFailure, serviceFailure } from './action-result'

describe('safe action errors', () => {
	it('maps credentials and conflicts to exact safe messages', () => {
		expect(mapAuthError(401, { code: 'INVALID_CREDENTIALS', message: 'Provider detail' }).message).toBe('Invalid email or password')
		expect(mapAuthError(409, { code: 'EMAIL_ALREADY_EXISTS', message: 'Provider detail' })).toEqual({ ok: false, code: 'EMAIL_ALREADY_EXISTS', message: 'Email already exists.', fieldErrors: { email: ['Email already exists.'] } })
	})
	it('maps invalid and unknown payloads to a retryable service failure', () => {
		expect(mapAuthError(500, { token: 'test-only', message: 'unsafe' })).toEqual(serviceFailure('login'))
		expect(mapAuthError(429, { code: 'RATE_LIMITED', message: 'unsafe' }).message).toContain('try again')
	})
	it('hides a login cause, field errors included, behind the one login message and code', () => {
		const cause = mapAuthError(400, { code: 'VALIDATION_FAILED', message: 'unsafe', fieldErrors: { email: ['unsafe'] } }, 'login')
		expect(publicFailure('login', cause)).toEqual({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })
	})
	it.each(['signup', 'logout'] as const)('returns a %s cause unchanged', (operation) => {
		const cause = mapAuthError(413, { code: 'PAYLOAD_TOO_LARGE', message: 'unsafe' }, operation)
		expect(publicFailure(operation, cause)).toEqual({ ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'This request is too large. Check the form and try again.' })
	})
	it('lets an unverified email through login with its own message, ahead of the generic 403', () => {
		const cause = mapAuthError(403, { code: 'EMAIL_NOT_VERIFIED', message: 'unsafe' }, 'login')
		expect(cause).toEqual({ ok: false, code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before logging in.' })
		expect(publicFailure('login', cause)).toEqual({ ok: false, code: 'EMAIL_NOT_VERIFIED', message: 'Verify your email before logging in.' })
		expect(publicFailure('login', mapAuthError(403, { code: 'ORIGIN_REJECTED', message: 'unsafe' }, 'login'))).toEqual({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })
	})
	it.each([
		[429, { code: 'RATE_LIMITED', message: 'unsafe' }, { ok: false, code: 'RATE_LIMITED', message: 'You asked for too many emails. Please try again later.' }],
		[503, { code: 'SERVICE_UNAVAILABLE', message: 'unsafe' }, { ok: false, code: 'SERVICE_UNAVAILABLE', message: 'We could not send the email. Please try again.' }],
		[500, '<html>unsafe</html>', { ok: false, code: 'SERVICE_UNAVAILABLE', message: 'We could not send the email. Please try again.' }],
	])('maps a resend answer of %i to its own message', (status, payload, expected) => {
		expect(mapAuthError(status, payload, 'resend-verification')).toEqual(expected)
	})
	it('never suggests replaying an unknown signup outcome', () => {
		expect(serviceFailure('signup').message).toContain('try logging in with your email')
	})
})
