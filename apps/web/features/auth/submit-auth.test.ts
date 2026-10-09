import { expect, it, vi } from 'vitest'
import { redirect } from 'next/navigation'
import { submitAuth } from './submit-auth'

it('clears transient secrets on confirmed redirect and preserves framework control flow', async () => {
	const complete = vi.fn()
	let redirectError: unknown
	try { redirect('/recipes') } catch (error) { redirectError = error }
	await expect(submitAuth(() => Promise.reject(redirectError), 'login', complete)).rejects.toBe(redirectError)
	expect(complete).toHaveBeenCalledOnce()
})

it('maps transport failures without treating them as success or replaying signup', async () => {
	const complete = vi.fn()
	const result = await submitAuth(() => Promise.reject(new TypeError('Test transport failed')), 'signup', complete)
	expect(result.message).toContain('try logging in with your chosen username')
	expect(complete).not.toHaveBeenCalled()
})
