import { createRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { describe, expect, it } from 'vitest'
import { existingPhoto, newPhoto, noPhoto } from './recipe-photo'
import { createEmptyRecipeValues, parseAmount, recipeFormSchema, toCreateRecipeMetadata, TO_TASTE, type RecipeFormValues } from './recipe-form-schema'

const valid = (overrides: Partial<RecipeFormValues> = {}): RecipeFormValues => ({
	...createEmptyRecipeValues(),
	title: '  Creamy Garlic Pasta  ',
	ingredients: [{ name: ' Spaghetti ', amount: '200', unit: 'g' }],
	instructions: [{ id: null, description: ' Boil the pasta. ', photo: noPhoto() }],
	...overrides,
})
const issues = (values: RecipeFormValues) => {
	const result = recipeFormSchema.safeParse(values)
	return result.success ? {} : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

describe('toCreateRecipeMetadata', () => {
	it('trims text and turns blank optional fields into null', () => {
		const metadata = toCreateRecipeMetadata(valid({ description: '  ', prepTime: '', cookTime: ' ', servings: '', videoUrl: '', notes: '\n' }))
		expect(metadata).toMatchObject({ title: 'Creamy Garlic Pasta', description: null, prepTimeMinutes: null, cookTimeMinutes: null, servings: null, videoUrl: null, notes: null })
		expect(metadata.ingredients[0].name).toBe('Spaghetti')
		expect(metadata.instructions[0].description).toBe('Boil the pasta.')
	})

	it('keeps zero prep time, reads whole numbers and keeps category selection order', () => {
		const metadata = toCreateRecipeMetadata(valid({ prepTime: '0', cookTime: '20', servings: '2', categories: ['category-dinner', 'category-breakfast'] }))
		expect(metadata).toMatchObject({ prepTimeMinutes: 0, cookTimeMinutes: 20, servings: 2, categoryIds: ['category-dinner', 'category-breakfast'] })
	})

	it('maps decimals and "to taste" rows', () => {
		const metadata = toCreateRecipeMetadata(valid({ ingredients: [
			{ name: 'Flour', amount: '0.125', unit: 'cup' },
			{ name: 'Salt', amount: '', unit: TO_TASTE },
			{ name: 'Pepper', amount: '3', unit: TO_TASTE },
		] }))
		expect(metadata.ingredients).toEqual([
			{ name: 'Flour', quantity: 0.125, unit: 'cup' },
			{ name: 'Salt', quantity: null, unit: null },
			{ name: 'Pepper', quantity: null, unit: null },
		])
	})

	it('marks hasImage from the attached photo and its output satisfies the shared schema', () => {
		const photo = new File(['x'], 'boil.jpg', { type: 'image/jpeg' })
		const metadata = toCreateRecipeMetadata(valid({ instructions: [{ id: null, description: 'Boil', photo: newPhoto(photo) }, { id: null, description: 'Drain', photo: noPhoto() }], videoUrl: 'https://youtu.be/abc' }))
		expect(metadata.instructions.map((step) => step.hasImage)).toEqual([true, false])
		expect(createRecipeMetadataSchema.safeParse(metadata).success).toBe(true)
	})
})

describe('parseAmount', () => {
	it('accepts positive decimals up to three places', () => {
		expect(parseAmount('1.5')).toEqual({ ok: true, value: 1.5 })
		expect(parseAmount(' 999999999.999 ')).toEqual({ ok: true, value: 999999999.999 })
		expect(parseAmount('.5')).toEqual({ ok: true, value: 0.5 })
	})

	it.each([
		['1/2', 0.5], ['1 1/2', 1.5], [' 3/4 ', 0.75], ['1/3', 0.333], ['2/3', 0.667], ['3/2', 1.5],
		['½', 0.5], ['1½', 1.5], ['1 ½', 1.5], ['⅓', 0.333], ['2⅔', 2.667], ['¾', 0.75], ['⅛', 0.125],
	])('accepts the kitchen fraction %j as %s, rounded to three decimals', (text, value) => {
		expect(parseAmount(text)).toEqual({ ok: true, value })
	})

	it.each(['1/0', '0/2', '1/', '/2', '1 1', '1.5/2', '½½', '1/2/3', '½ 1'])('rejects the malformed fraction %j', (text) => {
		expect(parseAmount(text)).toMatchObject({ ok: false })
	})

	it('rejects zero, extra precision, overflow and non-numbers', () => {
		expect(parseAmount('0')).toMatchObject({ ok: false })
		expect(parseAmount('1.2345')).toEqual({ ok: false, message: 'Use at most 3 decimal places.' })
		expect(parseAmount('1000000000')).toMatchObject({ ok: false })
		expect(parseAmount('abc')).toEqual({ ok: false, message: 'Enter a number such as 1.5, 1/2 or 1 1/2.' })
		expect(parseAmount('-1')).toMatchObject({ ok: false })
	})
})

describe('recipeFormSchema', () => {
	it('accepts a minimal recipe', () => {
		expect(issues(valid())).toEqual({})
	})

	it('reports a blank title, blank rows and a malformed amount on the exact field', () => {
		const found = issues(valid({ title: '  ', ingredients: [{ name: '', amount: '', unit: '' }, { name: 'Sugar', amount: '1/0', unit: 'cup' }], instructions: [{ id: null, description: ' ', photo: noPhoto() }] }))
		expect(found['title']).toBe('Add a title before saving.')
		expect(found['ingredients.0.name']).toBe('Add an ingredient name.')
		expect(found['ingredients.0.amount']).toBe('Enter an amount, or choose “to taste”.')
		expect(found['ingredients.1.amount']).toBe('Enter a number such as 1.5, 1/2 or 1 1/2.')
		expect(found['instructions.0.description']).toBe('Describe this step.')
	})

	it('asks for a unit when an amount is given without one and ignores amounts for "to taste"', () => {
		expect(issues(valid({ ingredients: [{ name: 'Rice', amount: '2', unit: '' }] }))['ingredients.0.unit']).toBe('Choose a unit.')
		expect(issues(valid({ ingredients: [{ name: 'Salt', amount: '', unit: TO_TASTE }] }))).toEqual({})
	})

	it('validates optional numbers, link and limits with the shared limits', () => {
		const found = issues(valid({ prepTime: '1.5', cookTime: '-2', servings: '0', videoUrl: 'http://example.com/v', notes: 'n'.repeat(5001), description: 'd'.repeat(2001) }))
		expect(Object.keys(found).sort()).toEqual(['cookTime', 'description', 'notes', 'prepTime', 'servings', 'videoUrl'])
		expect(issues(valid({ title: 't'.repeat(201) }))['title']).toBeDefined()
		expect(issues(valid({ categories: ['category-lunch', 'category-dinner', 'category-snacks', 'category-desserts'] }))['categories']).toBeDefined()
	})

	it('limits rows to 100 and requires at least one', () => {
		const many = Array.from({ length: 101 }, () => ({ name: 'x', amount: '1', unit: 'g' as const }))
		expect(issues(valid({ ingredients: many }))['ingredients']).toBeDefined()
		expect(issues(valid({ ingredients: [] }))['ingredients']).toBeDefined()
		expect(issues(valid({ instructions: [] }))['instructions']).toBeDefined()
	})
})

describe('photo slots', () => {
	const file = (name: string, type = 'image/png', size = 4) => {
		const picked = new File(['x'], name, { type })
		Object.defineProperty(picked, 'size', { value: size })
		return picked
	}

	it('starts every slot empty, with new steps carrying no id', () => {
		const empty = createEmptyRecipeValues()
		expect(empty.cover).toEqual({ kind: 'none' })
		expect(empty.instructions).toEqual([{ id: null, description: '', photo: { kind: 'none' } }])
	})

	it('accepts stored photos and valid new files', () => {
		expect(issues(valid({ cover: existingPhoto('https://storage.example/cover.jpg'), instructions: [{ id: 's1', description: 'Boil', photo: existingPhoto('https://storage.example/s1.jpg') }] }))).toEqual({})
		expect(issues(valid({ cover: newPhoto(file('cover.png')) }))).toEqual({})
	})

	it('reports an unsupported or oversized new file on its own slot and ignores stored photos', () => {
		const found = issues(valid({
			cover: newPhoto(file('logo.svg', 'image/svg+xml')),
			instructions: [{ id: 's1', description: 'Boil', photo: newPhoto(file('huge.png', 'image/png', 6 * 1024 * 1024)) }],
		}))
		expect(found['cover']).toBe('logo.svg is not a JPG, PNG or WebP image.')
		expect(found['instructions.0.photo']).toMatch(/huge\.png is 6\.0 MB/)
	})

	it('rejects a slot that is not one of the three photo states', () => {
		expect(issues(valid({ cover: { kind: 'new', file: 'nope' } as never }))['cover']).toBe('Choose an image file.')
		expect(issues(valid({ cover: null as never }))['cover']).toBe('Choose an image file.')
	})
})
