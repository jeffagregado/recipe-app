import { describe, expect, it } from 'vitest'
import { mapAuthError, publicFailure, serviceFailure } from './action-result'

describe('safe action errors', () => {
	it('maps credentials and conflicts to exact safe messages', () => {
		expect(mapAuthError(401, { code: 'INVALID_CREDENTIALS', message: 'Provider detail' }).message).toBe('Invalid username or password')
		expect(mapAuthError(409, { code: 'USERNAME_UNAVAILABLE', message: 'Provider detail' }).fieldErrors).toEqual({ username: ['Username is unavailable.'] })
	})
	it('maps invalid and unknown payloads to a retryable service failure', () => {
		expect(mapAuthError(500, { token: 'test-only', message: 'unsafe' })).toEqual(serviceFailure('login'))
		expect(mapAuthError(429, { code: 'RATE_LIMITED', message: 'unsafe' }).message).toContain('try again')
	})
	it('hides a login cause, field errors included, behind the one login message and code', () => {
		const cause = mapAuthError(400, { code: 'VALIDATION_FAILED', message: 'unsafe', fieldErrors: { username: ['unsafe'] } }, 'login')
		expect(publicFailure('login', cause)).toEqual({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' })
	})
	it.each(['signup', 'logout'] as const)('returns a %s cause unchanged', (operation) => {
		const cause = mapAuthError(413, { code: 'PAYLOAD_TOO_LARGE', message: 'unsafe' }, operation)
		expect(publicFailure(operation, cause)).toEqual({ ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'This request is too large. Check the form and try again.' })
	})
	it('never suggests replaying an unknown signup outcome', () => {
		expect(serviceFailure('signup').message).toContain('try logging in with your chosen username')
	})
})
