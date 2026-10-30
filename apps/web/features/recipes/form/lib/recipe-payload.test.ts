import { describe, expect, it } from 'vitest'
import { prepareRecipePayload } from './recipe-payload'
import { createEmptyRecipeValues, type RecipeFormValues } from './recipe-form-schema'
import { existingPhoto, noPhoto, pendingPhoto } from './recipe-photo'

const PHOTO_ID = '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70'
const OTHER_ID = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const file = (name: string) => new File(['x'], name, { type: 'image/webp', lastModified: 1 })

const values = (overrides: Partial<RecipeFormValues> = {}): RecipeFormValues => ({
	...createEmptyRecipeValues(),
	title: 'Pasta',
	ingredients: [{ heading: null, rows: [{ name: 'Pasta', amount: '200', unit: 'g' }] }],
	instructions: [{ heading: null, steps: [{ key: 's1', id: 's1', description: 'Boil', photo: existingPhoto('https://storage.example/s1.jpg') }] }],
	cover: existingPhoto('https://storage.example/cover.jpg'),
	...overrides,
})
const withStepPhoto = (photo: RecipeFormValues['cover']) => ({ instructions: [{ heading: null, steps: [{ key: 's1', id: 's1', description: 'Boil', photo }] }] })

describe('create mode', () => {
	it('names each step’s Pending photo and sends no photo files', () => {
		const prepared = prepareRecipePayload('create', values({ cover: noPhoto(), instructions: [{ heading: null, steps: [{ key: 'k1', id: null, description: 'Boil', photo: pendingPhoto(file('boil.webp'), PHOTO_ID) }] }] }))
		const data = prepared!.build('11111111-1111-4111-8111-111111111111')
		expect(JSON.parse(data.get('recipe') as string).instructions).toEqual([{ description: 'Boil', hasImage: false, image: { pendingPhotoId: PHOTO_ID }, heading: null }])
		expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
	})

	it('returns null for values the shared schema rejects', () => {
		expect(prepareRecipePayload('create', values({ title: ' ' }))).toBeNull()
	})
})

describe('edit mode', () => {
	it('builds the update payload with image slots and no files for kept photos', () => {
		const data = prepareRecipePayload('edit', values())!.build('11111111-1111-4111-8111-111111111111')
		expect(JSON.parse(data.get('recipe') as string)).toMatchObject({ cover: 'keep', instructions: [{ id: 's1', description: 'Boil', image: 'keep', heading: null }] })
		expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
	})

	it('names a replaced slot’s Pending photo and sends no photo files', () => {
		const data = prepareRecipePayload('edit', values({ cover: pendingPhoto(file('cover.webp'), PHOTO_ID) }))!.build('11111111-1111-4111-8111-111111111111')
		expect(JSON.parse(data.get('recipe') as string).cover).toEqual({ pendingPhotoId: PHOTO_ID })
		expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
	})

	it('returns null for values the shared schema rejects', () => {
		expect(prepareRecipePayload('edit', values({ ingredients: [{ heading: null, rows: [{ name: 'Pasta', amount: 'lots', unit: 'g' }] }] }))).toBeNull()
	})
})

describe('fingerprint', () => {
	const fingerprint = (mode: 'create' | 'edit', overrides?: Partial<RecipeFormValues>) => prepareRecipePayload(mode, values(overrides))!.fingerprint

	it('is stable for the same values so a retry can reuse its submission key', () => {
		expect(fingerprint('edit')).toBe(fingerprint('edit'))
		expect(fingerprint('edit', { cover: pendingPhoto(file('a.webp'), PHOTO_ID) })).toBe(fingerprint('edit', { cover: pendingPhoto(file('a.webp'), PHOTO_ID) }))
	})

	it('changes with text, and with every image slot state', () => {
		const baseline = fingerprint('edit')
		expect(fingerprint('edit', { title: 'Pasta 2' })).not.toBe(baseline)
		expect(fingerprint('edit', { cover: noPhoto() })).not.toBe(baseline)
		expect(fingerprint('edit', { cover: pendingPhoto(file('a.webp'), PHOTO_ID) })).not.toBe(baseline)
		expect(fingerprint('edit', withStepPhoto(noPhoto()))).not.toBe(baseline)
		expect(fingerprint('edit', withStepPhoto(pendingPhoto(file('b.webp'), PHOTO_ID)))).not.toBe(baseline)
	})

	it('tells photos apart by their Pending photo ids, not their files', () => {
		expect(fingerprint('create', withStepPhoto(pendingPhoto(file('a.webp'), PHOTO_ID)))).not.toBe(fingerprint('create', withStepPhoto(pendingPhoto(file('a.webp'), OTHER_ID))))
		expect(fingerprint('create', withStepPhoto(pendingPhoto(file('a.webp'), PHOTO_ID)))).toBe(fingerprint('create', withStepPhoto(pendingPhoto(file('b.webp'), PHOTO_ID))))
	})
})
