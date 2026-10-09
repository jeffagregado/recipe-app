import { updateRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { describe, expect, it } from 'vitest'
import { recipeDetailFixture } from '@/features/recipes/queries/recipe-detail.fixture'
import { recipeFormSchema, TO_TASTE, type RecipeFormValues } from './recipe-form-schema'
import { toRecipeFormValues, toUpdateRecipeMetadata } from './recipe-edit'
import { existingPhoto, newPhoto, noPhoto } from './recipe-photo'

const file = (name: string) => new File(['x'], name, { type: 'image/png' })

const base = (overrides: Partial<RecipeFormValues> = {}): RecipeFormValues => ({
	title: ' Pasta ', description: '', categories: ['Dinner'], prepTime: '', cookTime: '', servings: '', videoUrl: '', notes: '',
	cover: noPhoto(),
	ingredients: [{ name: 'Pasta', amount: '200', unit: 'g' }],
	instructions: [{ id: 's1', description: 'Boil', photo: noPhoto() }],
	...overrides,
})

describe('toRecipeFormValues', () => {
	const detail = recipeDetailFixture({
		title: 'Layered Cake',
		description: 'Sweet and soft.',
		categories: ['Desserts', 'Breakfast', 'Snacks'],
		imageUrl: 'https://storage.example/cover.jpg',
		servings: 8,
		prepTimeMinutes: 0,
		cookTimeMinutes: 40,
		notes: 'Line one\nLine two',
		videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		ingredients: [
			{ id: 'i2', ingredientId: 'b2', name: 'Sugar', quantity: 1.5, unit: 'cup', preparation: null, note: null, sortOrder: 1 },
			{ id: 'i1', ingredientId: 'b1', name: 'Flour', quantity: 0.125, unit: 'g', preparation: null, note: null, sortOrder: 0 },
			{ id: 'i3', ingredientId: 'b3', name: 'Salt', quantity: null, unit: null, preparation: null, note: null, sortOrder: 2 },
		],
		instructions: [
			{ id: 's2', stepNumber: 2, description: 'Bake.', imageUrl: 'https://storage.example/step2.jpg' },
			{ id: 's1', stepNumber: 1, description: 'Mix.', imageUrl: null },
		],
	})

	it('turns numbers into the strings the form edits and keeps the stored category order', () => {
		const values = toRecipeFormValues(detail)
		expect(values).toMatchObject({
			title: 'Layered Cake', description: 'Sweet and soft.', categories: ['Desserts', 'Breakfast', 'Snacks'],
			prepTime: '0', cookTime: '40', servings: '8', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', notes: 'Line one\nLine two',
		})
	})

	it('maps ingredients in stored order, decimals as typed and a missing quantity to "to taste"', () => {
		expect(toRecipeFormValues(detail).ingredients).toEqual([
			{ name: 'Flour', amount: '0.125', unit: 'g' },
			{ name: 'Sugar', amount: '1.5', unit: 'cup' },
			{ name: 'Salt', amount: '', unit: TO_TASTE },
		])
	})

	it('maps steps in step order with their ids and stored photos, and the stored cover', () => {
		const values = toRecipeFormValues(detail)
		expect(values.instructions).toEqual([
			{ id: 's1', description: 'Mix.', photo: { kind: 'none' } },
			{ id: 's2', description: 'Bake.', photo: { kind: 'existing', url: 'https://storage.example/step2.jpg' } },
		])
		expect(values.cover).toEqual({ kind: 'existing', url: 'https://storage.example/cover.jpg' })
	})

	it('maps blank optional fields to empty strings and a missing cover to no photo', () => {
		const values = toRecipeFormValues(recipeDetailFixture())
		expect(values).toMatchObject({ description: '', prepTime: '', cookTime: '', servings: '', videoUrl: '', notes: '', categories: [], cover: { kind: 'none' } })
	})

	it('produces values the form accepts unchanged', () => {
		expect(recipeFormSchema.safeParse(toRecipeFormValues(detail)).success).toBe(true)
	})

	it('round-trips to metadata that keeps every stored photo', () => {
		const metadata = toUpdateRecipeMetadata(toRecipeFormValues(detail))
		expect(updateRecipeMetadataSchema.safeParse(metadata).success).toBe(true)
		expect(metadata.cover).toBe('keep')
		expect(metadata.instructions).toEqual([
			{ id: 's1', description: 'Mix.', image: 'remove' },
			{ id: 's2', description: 'Bake.', image: 'keep' },
		])
	})
})

describe('toUpdateRecipeMetadata', () => {
	it('shares the create field rules: trimming, nulls, numbers and "to taste"', () => {
		const metadata = toUpdateRecipeMetadata(base({ prepTime: '10', ingredients: [{ name: ' Flour ', amount: '0.5', unit: 'cup' }, { name: 'Salt', amount: '', unit: TO_TASTE }] }))
		expect(metadata).toMatchObject({
			title: 'Pasta', description: null, prepTimeMinutes: 10, cookTimeMinutes: null, servings: null, videoUrl: null, notes: null, categories: ['Dinner'],
			ingredients: [{ name: 'Flour', quantity: 0.5, unit: 'cup' }, { name: 'Salt', quantity: null, unit: null }],
		})
		expect(updateRecipeMetadataSchema.safeParse(metadata).success).toBe(true)
	})

	it('keeps an untouched stored cover and step photo', () => {
		const metadata = toUpdateRecipeMetadata(base({ cover: existingPhoto('https://storage.example/c.jpg'), instructions: [{ id: 's1', description: 'Boil', photo: existingPhoto('https://storage.example/s1.jpg') }] }))
		expect(metadata.cover).toBe('keep')
		expect(metadata.instructions).toEqual([{ id: 's1', description: 'Boil', image: 'keep' }])
	})

	it('replaces a slot when a new file was picked, for the cover and for an existing step', () => {
		const metadata = toUpdateRecipeMetadata(base({ cover: newPhoto(file('new-cover.png')), instructions: [{ id: 's1', description: 'Boil', photo: newPhoto(file('boil.png')) }] }))
		expect(metadata.cover).toBe('replace')
		expect(metadata.instructions[0]).toEqual({ id: 's1', description: 'Boil', image: 'replace' })
	})

	it('removes a slot that was emptied, and also states "remove" for a slot that never had a photo', () => {
		const metadata = toUpdateRecipeMetadata(base())
		expect(metadata.cover).toBe('remove')
		expect(metadata.instructions[0].image).toBe('remove')
	})

	it('sends a new step with no id and either its new photo or "remove"', () => {
		const metadata = toUpdateRecipeMetadata(base({ instructions: [
			{ id: 's1', description: 'Boil', photo: existingPhoto('https://storage.example/s1.jpg') },
			{ id: null, description: 'Serve', photo: newPhoto(file('serve.png')) },
			{ id: null, description: 'Garnish', photo: noPhoto() },
		] }))
		expect(metadata.instructions).toEqual([
			{ id: 's1', description: 'Boil', image: 'keep' },
			{ id: null, description: 'Serve', image: 'replace' },
			{ id: null, description: 'Garnish', image: 'remove' },
		])
		expect(updateRecipeMetadataSchema.safeParse(metadata).success).toBe(true)
	})

	it('lets a stored photo follow its step when steps are reordered', () => {
		const metadata = toUpdateRecipeMetadata(base({ instructions: [
			{ id: 's2', description: 'Serve', photo: existingPhoto('https://storage.example/s2.jpg') },
			{ id: 's1', description: 'Boil', photo: noPhoto() },
		] }))
		expect(metadata.instructions).toEqual([
			{ id: 's2', description: 'Serve', image: 'keep' },
			{ id: 's1', description: 'Boil', image: 'remove' },
		])
	})

	it('drops a deleted step and its photo by leaving it out', () => {
		const metadata = toUpdateRecipeMetadata(base({ instructions: [{ id: 's2', description: 'Serve', photo: existingPhoto('https://storage.example/s2.jpg') }] }))
		expect(metadata.instructions.map((step) => step.id)).toEqual(['s2'])
	})
})
