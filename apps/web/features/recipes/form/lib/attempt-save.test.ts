import { redirect } from 'next/navigation'
import { expect, it, vi } from 'vitest'
import { attemptSave } from './attempt-save'
import type { RecipeSaveBody } from './recipe-payload'

const payload = { recipe: { title: 'Pasta' }, idempotencyKey: '11111111-1111-4111-8111-111111111111' } as unknown as RecipeSaveBody

it('hands back the result the action resolved with', async () => {
	const result = { status: 'failed', message: 'Nope' } as const
	expect(await attemptSave(vi.fn().mockResolvedValue(result), payload, 'unknown')).toEqual({ result })
})

it('hands back the redirect a confirmed save throws, for Next to receive', async () => {
	const outcome = await attemptSave(async () => redirect('/recipes/1?notice=recipe-saved'), payload, 'unknown')
	expect(outcome).toMatchObject({ navigation: { digest: expect.stringContaining('NEXT_REDIRECT') } })
})

it('reports an unknown outcome when the action itself throws', async () => {
	const outcome = await attemptSave(vi.fn().mockRejectedValue(new Error('Failed to find Server Action')), payload, 'We couldn’t confirm that.')
	expect(outcome).toEqual({ result: { status: 'unknown', message: 'We couldn’t confirm that.' } })
})
