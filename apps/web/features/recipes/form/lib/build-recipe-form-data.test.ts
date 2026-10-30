import type { CreateRecipeMetadata } from '@recipe-app/contracts/types'
import { expect, it } from 'vitest'
import { buildRecipeFormData } from './build-recipe-form-data'

const PHOTO_ID = '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70'
const metadata: CreateRecipeMetadata = {
	title: 'Pasta', description: null, categoryIds: ['category-dinner'], servings: null, prepTimeMinutes: null, cookTimeMinutes: null, videoUrl: null, notes: null,
	ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
	instructions: [{ description: 'Boil', hasImage: false, image: { pendingPhotoId: PHOTO_ID } }, { description: 'Drain', hasImage: false }],
}

it('sends the metadata JSON and the key, and no photo parts', () => {
	const data = buildRecipeFormData(metadata, 'key-1')
	expect(JSON.parse(data.get('recipe') as string)).toEqual(metadata)
	expect(data.get('idempotencyKey')).toBe('key-1')
	expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
})
