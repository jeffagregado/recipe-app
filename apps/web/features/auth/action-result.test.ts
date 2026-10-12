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
	it.each([
		['wrong credentials', mapAuthError(401, { code: 'INVALID_CREDENTIALS', message: 'unsafe' }, 'login')],
		['a rejected origin', mapAuthError(403, { code: 'ORIGIN_REJECTED', message: 'unsafe' }, 'login')],
		['rate limiting', mapAuthError(429, { code: 'RATE_LIMITED', message: 'unsafe' }, 'login')],
		['a payload that is too large', mapAuthError(413, { code: 'PAYLOAD_TOO_LARGE', message: 'unsafe' }, 'login')],
		['an upstream validation failure', mapAuthError(400, { code: 'VALIDATION_FAILED', message: 'unsafe', fieldErrors: { username: ['unsafe'] } }, 'login')],
		['an unavailable service', mapAuthError(503, { code: 'SERVICE_UNAVAILABLE', message: 'unsafe' }, 'login')],
		['an unexpected response', mapAuthError(500, { token: 'test-only' }, 'login')],
		['an unknown outcome', serviceFailure('login')],
	])('hides %s behind the one login message and code', (_cause, failure) => {
		expect(publicFailure('login', failure)).toEqual({ ok: false, code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' })
	})
	it.each([
		['signup', 'RATE_LIMITED', 'Too many attempts. Please wait and try again.'],
		['signup', 'SERVICE_UNAVAILABLE', 'We could not confirm signup. Your account may have been created; try logging in with your chosen username. Do not submit signup again automatically.'],
		['logout', 'SERVICE_UNAVAILABLE', 'Could not confirm logout. Please try again.'],
	] as const)('keeps the %s cause %s and its message', (operation, code, message) => {
		expect(publicFailure(operation, mapAuthError(code === 'RATE_LIMITED' ? 429 : 503, { code, message: 'unsafe' }, operation))).toEqual({ ok: false, code, message })
	})
	it('never suggests replaying an unknown signup outcome', () => {
		expect(serviceFailure('signup').message).toContain('try logging in with your chosen username')
	})
})
