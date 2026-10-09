import { describe, expect, it } from 'vitest'
import { prepareRecipePayload } from './recipe-payload'
import { createEmptyRecipeValues, type RecipeFormValues } from './recipe-form-schema'
import { existingPhoto, newPhoto, noPhoto } from './recipe-photo'

const file = (name: string, size = 4) => {
	const picked = new File(['x'], name, { type: 'image/png', lastModified: 1 })
	Object.defineProperty(picked, 'size', { value: size })
	return picked
}

const values = (overrides: Partial<RecipeFormValues> = {}): RecipeFormValues => ({
	...createEmptyRecipeValues(),
	title: 'Pasta',
	ingredients: [{ name: 'Pasta', amount: '200', unit: 'g' }],
	instructions: [{ id: 's1', description: 'Boil', photo: existingPhoto('https://storage.example/s1.jpg') }],
	cover: existingPhoto('https://storage.example/cover.jpg'),
	...overrides,
})

describe('create mode', () => {
	it('builds the create payload with the step photo it declares', () => {
		const prepared = prepareRecipePayload('create', values({ cover: noPhoto(), instructions: [{ id: null, description: 'Boil', photo: newPhoto(file('boil.png')) }] }))
		const data = prepared!.build('11111111-1111-4111-8111-111111111111')
		expect(JSON.parse(data.get('recipe') as string).instructions).toEqual([{ description: 'Boil', hasImage: true }])
		expect((data.get('step-0') as File).name).toBe('boil.png')
	})

	it('returns null for values the shared schema rejects', () => {
		expect(prepareRecipePayload('create', values({ title: ' ' }))).toBeNull()
	})
})

describe('edit mode', () => {
	it('builds the update payload with image slots and no files for kept photos', () => {
		const data = prepareRecipePayload('edit', values())!.build('11111111-1111-4111-8111-111111111111')
		expect(JSON.parse(data.get('recipe') as string)).toMatchObject({ cover: 'keep', instructions: [{ id: 's1', description: 'Boil', image: 'keep' }] })
		expect([...data.keys()].sort()).toEqual(['idempotencyKey', 'recipe'])
	})

	it('uploads only replaced slots', () => {
		const data = prepareRecipePayload('edit', values({ cover: newPhoto(file('cover.png')) }))!.build('11111111-1111-4111-8111-111111111111')
		expect([...data.keys()].sort()).toEqual(['cover', 'idempotencyKey', 'recipe'])
	})

	it('returns null for values the shared schema rejects', () => {
		expect(prepareRecipePayload('edit', values({ ingredients: [{ name: 'Pasta', amount: 'lots', unit: 'g' }] }))).toBeNull()
	})
})

describe('fingerprint', () => {
	const fingerprint = (mode: 'create' | 'edit', overrides?: Partial<RecipeFormValues>) => prepareRecipePayload(mode, values(overrides))!.fingerprint

	it('is stable for the same values so a retry can reuse its submission key', () => {
		expect(fingerprint('edit')).toBe(fingerprint('edit'))
		expect(fingerprint('edit', { cover: newPhoto(file('a.png')) })).toBe(fingerprint('edit', { cover: newPhoto(file('a.png')) }))
	})

	it('changes with text, and with every image slot state', () => {
		const baseline = fingerprint('edit')
		expect(fingerprint('edit', { title: 'Pasta 2' })).not.toBe(baseline)
		expect(fingerprint('edit', { cover: noPhoto() })).not.toBe(baseline)
		expect(fingerprint('edit', { cover: newPhoto(file('a.png')) })).not.toBe(baseline)
		expect(fingerprint('edit', { instructions: [{ id: 's1', description: 'Boil', photo: noPhoto() }] })).not.toBe(baseline)
		expect(fingerprint('edit', { instructions: [{ id: 's1', description: 'Boil', photo: newPhoto(file('b.png')) }] })).not.toBe(baseline)
	})

	it('tells two different replacement files for the same slot apart', () => {
		expect(fingerprint('edit', { cover: newPhoto(file('a.png')) })).not.toBe(fingerprint('edit', { cover: newPhoto(file('b.png')) }))
		expect(fingerprint('edit', { cover: newPhoto(file('a.png', 4)) })).not.toBe(fingerprint('edit', { cover: newPhoto(file('a.png', 5)) }))
	})
})
