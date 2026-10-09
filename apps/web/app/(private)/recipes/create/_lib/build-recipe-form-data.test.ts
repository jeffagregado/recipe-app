import type { CreateRecipeMetadata } from '@recipe-app/contracts/types'
import { expect, it } from 'vitest'
import { buildRecipeFormData } from './build-recipe-form-data'

const metadata: CreateRecipeMetadata = {
	title: 'Pasta', description: null, categories: ['Dinner'], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
	ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
	instructions: [{ description: 'Boil', hasImage: true }, { description: 'Drain', hasImage: false }, { description: 'Serve', hasImage: true }],
}
const image = (name: string) => new File([name], name, { type: 'image/png' })

it('sends the metadata JSON, the key and one part per attached photo using the final step indexes', () => {
	const data = buildRecipeFormData(metadata, { cover: image('cover.png'), steps: [image('boil.png'), null, image('serve.png')] }, 'key-1')
	expect(JSON.parse(data.get('recipe') as string)).toEqual(metadata)
	expect(data.get('idempotencyKey')).toBe('key-1')
	expect((data.get('cover') as File).name).toBe('cover.png')
	expect([...data.keys()].sort()).toEqual(['cover', 'idempotencyKey', 'recipe', 'step-0', 'step-2'])
	expect((data.get('step-0') as File).name).toBe('boil.png')
	expect((data.get('step-2') as File).name).toBe('serve.png')
})

it('follows reordered steps and omits photos for steps without one', () => {
	const reordered: CreateRecipeMetadata = { ...metadata, instructions: [metadata.instructions[2], metadata.instructions[1], metadata.instructions[0]] }
	const data = buildRecipeFormData(reordered, { cover: null, steps: [image('serve.png'), null, image('boil.png')] }, 'key-2')
	expect(data.has('cover')).toBe(false)
	expect((data.get('step-0') as File).name).toBe('serve.png')
	expect(data.has('step-1')).toBe(false)
	expect((data.get('step-2') as File).name).toBe('boil.png')
})

it('never sends a file the metadata does not declare', () => {
	const data = buildRecipeFormData(metadata, { cover: null, steps: [null, image('stray.png'), null] }, 'key-3')
	expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
})
