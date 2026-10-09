import { describe, expect, it } from 'vitest'
import { mapAuthError, serviceFailure } from './action-result'

describe('safe action errors', () => {
	it('maps credentials and conflicts to exact safe messages', () => {
		expect(mapAuthError(401, { code: 'INVALID_CREDENTIALS', message: 'Provider detail' }).message).toBe('Invalid username or password')
		expect(mapAuthError(409, { code: 'USERNAME_UNAVAILABLE', message: 'Provider detail' }).fieldErrors).toEqual({ username: ['Username is unavailable.'] })
	})
	it('maps invalid and unknown payloads to a retryable service failure', () => {
		expect(mapAuthError(500, { token: 'test-only', message: 'unsafe' })).toEqual(serviceFailure('login'))
		expect(mapAuthError(429, { code: 'RATE_LIMITED', message: 'unsafe' }).message).toContain('try again')
	})
	it('never suggests replaying an unknown signup outcome', () => {
		expect(serviceFailure('signup').message).toContain('try logging in with your chosen username')
	})
})
