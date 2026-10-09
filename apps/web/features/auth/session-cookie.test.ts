import { describe, expect, it, vi } from 'vitest'
import { applySessionCookies, sessionCookieHeader } from './session-cookie'

describe('session cookie transport', () => {
	it('forwards only allowed cookies and encodes decoded values once', () => {
		const values = new Map([['better-auth.session_token', 'test/value+signature'], ['analytics', 'private']])
		expect(sessionCookieHeader({ get: (name) => values.has(name) ? { value: values.get(name)! } : undefined })).toBe('better-auth.session_token=test%2Fvalue%2Bsignature')
	})
	it('reads separate Set-Cookie headers and constrains browser attributes', () => {
		const store = { set: vi.fn() }
		const headers = new Headers()
		headers.append('Set-Cookie', 'analytics=ignored; Path=/')
		headers.append('Set-Cookie', '__Secure-better-auth.session_token=test%252Fvalue; Max-Age=9999999; Domain=hostile.invalid; Path=/other; SameSite=None; Expires=Wed, 21 Oct 2030 07:28:00 GMT')
		expect(applySessionCookies(headers, store)).toBe(1)
		expect(store.set).toHaveBeenCalledExactlyOnceWith('__Secure-better-auth.session_token', 'test%2Fvalue', { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 604800 })
	})
	it('expires zero-age and empty values while retaining secure attributes', () => {
		const store = { set: vi.fn() }
		const headers = new Headers()
		headers.append('Set-Cookie', 'better-auth.session_token=old; Max-Age=0; Secure')
		headers.append('Set-Cookie', '__Secure-better-auth.session_token=; Max-Age=604800')
		applySessionCookies(headers, store)
		expect(store.set).toHaveBeenNthCalledWith(1, 'better-auth.session_token', '', { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 0 })
		expect(store.set).toHaveBeenNthCalledWith(2, '__Secure-better-auth.session_token', '', { httpOnly: true, sameSite: 'lax', path: '/', secure: true, maxAge: 0 })
	})
	it.each(['abc', '-1', '1.5', '1e3', ''])('rejects invalid Max-Age %s without setting a cookie', (age) => {
		const store = { set: vi.fn() }
		expect(() => applySessionCookies(new Headers({ 'Set-Cookie': `better-auth.session_token=test; Max-Age=${age}` }), store)).toThrow('Invalid session cookie')
		expect(store.set).not.toHaveBeenCalled()
	})
	it('rejects malformed encoding without exposing cookie contents', () => {
		expect(() => applySessionCookies(new Headers({ 'Set-Cookie': 'better-auth.session_token=%broken; Max-Age=60' }), { set: vi.fn() })).toThrow('Invalid session cookie')
	})
})
