import { createRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { describe, expect, it } from 'vitest'
import { existingPhoto, noPhoto, pendingPhoto, pickedPhoto } from './recipe-photo'

const PHOTO_ID = '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70'
import { createEmptyRecipeValues, parseAmount, recipeFormSchema, toCreateRecipeMetadata, TO_TASTE, type RecipeFormValues } from './recipe-form-schema'

const valid = (overrides: Partial<RecipeFormValues> = {}): RecipeFormValues => ({
	...createEmptyRecipeValues(),
	title: '  Creamy Garlic Pasta  ',
	ingredients: [{ heading: null, rows: [{ name: ' Spaghetti ', amount: '200', unit: 'g' }] }],
	instructions: [{ heading: null, steps: [{ key: 'new- Boil the pasta. ', id: null, description: ' Boil the pasta. ', photo: noPhoto() }] }],
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
		const metadata = toCreateRecipeMetadata(valid({ ingredients: [{ heading: null, rows: [
			{ name: 'Flour', amount: '0.125', unit: 'cup' },
			{ name: 'Salt', amount: '', unit: TO_TASTE },
			{ name: 'Pepper', amount: '3', unit: TO_TASTE },
		] }] }))
		expect(metadata.ingredients).toEqual([
			{ name: 'Flour', quantity: 0.125, unit: 'cup', heading: null },
			{ name: 'Salt', quantity: null, unit: null, heading: null },
			{ name: 'Pepper', quantity: null, unit: null, heading: null },
		])
	})

	it('flattens groups in order, putting each trimmed heading on its group’s first row', () => {
		const metadata = toCreateRecipeMetadata(valid({
			ingredients: [
				{ heading: null, rows: [{ name: 'Pasta', amount: '200', unit: 'g' }] },
				{ heading: ' Sauce ', rows: [{ name: 'Butter', amount: '1 1/2', unit: 'tbsp' }, { name: 'Cream', amount: '½', unit: 'cup' }] },
			],
			instructions: [
				{ heading: null, steps: [{ key: 'new-Boil', id: null, description: 'Boil', photo: noPhoto() }] },
				{ heading: 'Make the sauce', steps: [{ key: 'new-Melt', id: null, description: 'Melt', photo: noPhoto() }, { key: 'new-Stir', id: null, description: 'Stir', photo: noPhoto() }] },
			],
		}))
		expect(metadata.ingredients).toEqual([
			{ name: 'Pasta', quantity: 200, unit: 'g', heading: null },
			{ name: 'Butter', quantity: 1.5, unit: 'tbsp', heading: 'Sauce' },
			{ name: 'Cream', quantity: 0.5, unit: 'cup', heading: null },
		])
		expect(metadata.instructions).toEqual([
			{ description: 'Boil', hasImage: false, heading: null },
			{ description: 'Melt', hasImage: false, heading: 'Make the sauce' },
			{ description: 'Stir', hasImage: false, heading: null },
		])
		expect(createRecipeMetadataSchema.safeParse(metadata).success).toBe(true)
	})

	it('names a step’s Pending photo, never a file, and its output satisfies the shared schema', () => {
		const photo = new File(['x'], 'boil.jpg', { type: 'image/jpeg' })
		const metadata = toCreateRecipeMetadata(valid({ instructions: [{ heading: null, steps: [{ key: 'new-Boil', id: null, description: 'Boil', photo: pendingPhoto(photo, PHOTO_ID) }, { key: 'new-Drain', id: null, description: 'Drain', photo: noPhoto() }] }], videoUrl: 'https://youtu.be/abc' }))
		expect(metadata.instructions.map(({ hasImage, image }) => ({ hasImage, image }))).toEqual([{ hasImage: false, image: { pendingPhotoId: PHOTO_ID } }, { hasImage: false, image: undefined }])
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

	it.each([
		['1/0', 'Enter a number such as 1.5, 1/2 or 1 1/2.'], ['0/2', 'Amount must be greater than 0.'], ['1/', 'Enter a number such as 1.5, 1/2 or 1 1/2.'],
		['/2', 'Enter a number such as 1.5, 1/2 or 1 1/2.'], ['1 1', 'Enter a number such as 1.5, 1/2 or 1 1/2.'], ['1.5/2', 'Enter a number such as 1.5, 1/2 or 1 1/2.'],
		['½½', 'Enter a number such as 1.5, 1/2 or 1 1/2.'], ['1/2/3', 'Enter a number such as 1.5, 1/2 or 1 1/2.'], ['½ 1', 'Enter a number such as 1.5, 1/2 or 1 1/2.'],
	])('rejects the malformed fraction %j', (text, message) => {
		expect(parseAmount(text)).toEqual({ ok: false, message })
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
		const found = issues(valid({ title: '  ', ingredients: [{ heading: null, rows: [{ name: '', amount: '', unit: '' }, { name: 'Sugar', amount: '1/0', unit: 'cup' }] }], instructions: [{ heading: null, steps: [{ key: 'new- ', id: null, description: ' ', photo: noPhoto() }] }] }))
		expect(found['title']).toBe('Add a title before saving.')
		expect(found['ingredients.0.rows.0.name']).toBe('Add an ingredient name.')
		expect(found['ingredients.0.rows.0.amount']).toBe('Enter an amount, or choose “to taste”.')
		expect(found['ingredients.0.rows.1.amount']).toBe('Enter a number such as 1.5, 1/2 or 1 1/2.')
		expect(found['instructions.0.steps.0.description']).toBe('Describe this step.')
	})

	it('asks for a unit when an amount is given without one and ignores amounts for "to taste"', () => {
		expect(issues(valid({ ingredients: [{ heading: null, rows: [{ name: 'Rice', amount: '2', unit: '' }] }] }))['ingredients.0.rows.0.unit']).toBe('Choose a unit.')
		expect(issues(valid({ ingredients: [{ heading: null, rows: [{ name: 'Salt', amount: '', unit: TO_TASTE }] }] }))).toEqual({})
	})

	it('validates optional numbers, link and limits with the shared limits', () => {
		const found = issues(valid({ prepTime: '1.5', cookTime: '-2', servings: '0', videoUrl: 'http://example.com/v', notes: 'n'.repeat(5001), description: 'd'.repeat(2001) }))
		expect(Object.keys(found).sort()).toEqual(['cookTime', 'description', 'notes', 'prepTime', 'servings', 'videoUrl'])
		expect(issues(valid({ title: 't'.repeat(201) }))['title']).toBeDefined()
		expect(issues(valid({ categories: ['category-lunch', 'category-dinner', 'category-snacks', 'category-desserts'] }))['categories']).toBeDefined()
	})

	it('limits rows to 100 across all groups and requires at least one', () => {
		const rows = (length: number) => Array.from({ length }, () => ({ name: 'x', amount: '1', unit: 'g' as const }))
		expect(issues(valid({ ingredients: [{ heading: null, rows: rows(60) }, { heading: 'Sauce', rows: rows(40) }] }))).toEqual({})
		expect(issues(valid({ ingredients: [{ heading: null, rows: rows(60) }, { heading: 'Sauce', rows: rows(41) }] }))['ingredients']).toBe('Use 100 ingredients or fewer.')
		expect(issues(valid({ ingredients: [{ heading: null, rows: [] }] }))['ingredients']).toBe('Add at least one ingredient.')
		expect(issues(valid({ instructions: [{ heading: null, steps: [] }] }))['instructions']).toBe('Add at least one step.')
	})

	it('asks for a name on a blank group heading and limits it to 100 characters', () => {
		const sauce = (heading: string) => valid({ ingredients: [...valid().ingredients, { heading, rows: [{ name: 'Butter', amount: '1', unit: 'tbsp' }] }] })
		expect(issues(sauce('  '))).toEqual({ 'ingredients.1.heading': 'Name this group, or remove the heading.' })
		expect(issues(sauce('x'.repeat(101)))).toEqual({ 'ingredients.1.heading': 'Use 100 characters or fewer.' })
		expect(issues(sauce('x'.repeat(100)))).toEqual({})
		const step = valid({ instructions: [...valid().instructions, { heading: '', steps: [{ key: 'new-Serve', id: null, description: 'Serve', photo: noPhoto() }] }] })
		expect(issues(step)).toEqual({ 'instructions.1.heading': 'Name this group, or remove the heading.' })
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
		expect(empty.instructions).toEqual([{ heading: null, steps: [{ key: expect.any(String), id: null, description: '', photo: { kind: 'none' } }] }])
	})

	it('accepts stored photos and uploaded Pending photos', () => {
		expect(issues(valid({ cover: existingPhoto('https://storage.example/cover.jpg'), instructions: [{ heading: null, steps: [{ key: 's1', id: 's1', description: 'Boil', photo: existingPhoto('https://storage.example/s1.jpg') }] }] }))).toEqual({})
		expect(issues(valid({ cover: pendingPhoto(file('cover.png'), PHOTO_ID) }))).toEqual({})
	})

	it('blocks a photo that is not yet a Pending photo on its own slot', () => {
		const found = issues(valid({
			cover: pickedPhoto(file('cover.png')),
			instructions: [{ heading: null, steps: [{ key: 's1', id: 's1', description: 'Boil', photo: pickedPhoto(file('boil.png')) }] }],
		}))
		expect(found).toEqual({ cover: 'Retry or remove this photo.', 'instructions.0.steps.0.photo': 'Retry or remove this photo.' })
	})

	it('rejects a slot that is not one of the three photo states', () => {
		expect(issues(valid({ cover: { kind: 'picked', file: 'nope' } as never }))['cover']).toBe('Choose an image file.')
		expect(issues(valid({ cover: null as never }))['cover']).toBe('Choose an image file.')
	})
})
