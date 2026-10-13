import { describe, expect, it } from 'vitest'
import { NOTICE_MESSAGES, noticeMessage, urlWithoutNotice, withNotice } from './notice'

describe('noticeMessage', () => {
	it('maps every known code to its toast text', () => {
		expect(NOTICE_MESSAGES).toEqual({ 'recipe-saved': 'Recipe saved', 'recipe-updated': 'Recipe updated', 'recipe-deleted': 'Recipe deleted', 'email-verified': 'Email verified. Log in to continue.' })
		expect(noticeMessage('recipe-saved')).toBe('Recipe saved')
	})

	it.each([null, '', 'unknown', 'toString', '__proto__'])('ignores %j', (code) => {
		expect(noticeMessage(code)).toBeNull()
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
