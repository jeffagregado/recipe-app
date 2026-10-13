import { describe, expect, it } from 'vitest'
import { NOTICE_MESSAGES, noticeIsError, noticeMessage, urlWithoutNotice, withNotice } from './notice'

describe('noticeMessage', () => {
	it('maps every known code to its toast text', () => {
		expect(NOTICE_MESSAGES).toEqual({ 'recipe-saved': 'Recipe saved', 'recipe-updated': 'Recipe updated', 'recipe-deleted': 'Recipe deleted', 'email-verified': 'Email verified. Log in to continue.', 'password-reset': 'Password updated. Log in with your new password.', 'google-sign-in-failed': 'Google sign-in did not complete. Try again.', 'google-email-not-verified': 'Google has not verified this email address. Verify it with Google, or sign up with a password.', 'google-account-not-verified': 'This email has an account that is not verified yet. Open the link we emailed you, then sign in with Google again.' })
		expect(noticeMessage('recipe-saved')).toBe('Recipe saved')
	})

	it.each([null, '', 'unknown', 'toString', '__proto__'])('ignores %j', (code) => {
		expect(noticeMessage(code)).toBeNull()
	})
})

describe('noticeIsError', () => {
	it.each([['google-sign-in-failed', true], ['google-email-not-verified', true], ['google-account-not-verified', true], ['email-verified', false], ['recipe-saved', false], ['unknown', false], [null, false]])('answers %j with %j', (code, expected) => {
		expect(noticeIsError(code)).toBe(expected)
	})
})

describe('withNotice', () => {
	it('appends the notice code to a path', () => {
		expect(withNotice('/recipes/abc', 'recipe-saved')).toBe('/recipes/abc?notice=recipe-saved')
	})

	it('keeps an existing query string', () => {
		expect(withNotice('/recipes?sort=new', 'recipe-deleted')).toBe('/recipes?sort=new&notice=recipe-deleted')
	})
})

describe('urlWithoutNotice', () => {
	it('removes only the notice parameter', () => {
		expect(urlWithoutNotice('/recipes', new URLSearchParams('q=pasta&notice=recipe-saved&sort=new'), '')).toBe('/recipes?q=pasta&sort=new')
	})

	it('drops the question mark when nothing else remains and keeps the hash', () => {
		expect(urlWithoutNotice('/recipes/abc', new URLSearchParams('notice=recipe-saved'), '#top')).toBe('/recipes/abc#top')
	})

	it('removes repeated notice parameters', () => {
		expect(urlWithoutNotice('/recipes', new URLSearchParams('notice=a&notice=b'), '')).toBe('/recipes')
	})
})
