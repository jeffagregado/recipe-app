import { updateRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { describe, expect, it } from 'vitest'
import { recipeDetailFixture } from '@/features/recipes/queries/recipe-detail.fixture'
import { recipeFormSchema, TO_TASTE, type InstructionFormRow, type RecipeFormValues } from './recipe-form-schema'
import { toRecipeFormValues, toUpdateRecipeMetadata } from './recipe-edit'
import { existingPhoto, noPhoto, pendingPhoto } from './recipe-photo'

const PHOTO_ID = '0b0f6a3e-4c1d-4d6e-9f1a-2b3c4d5e6f70'

const file = (name: string) => new File(['x'], name, { type: 'image/png' })
const steps = (...rows: InstructionFormRow[]): RecipeFormValues['instructions'] => [{ heading: null, steps: rows }]

const base = (overrides: Partial<RecipeFormValues> = {}): RecipeFormValues => ({
	title: ' Pasta ', description: '', categories: ['category-dinner'], prepTime: '', cookTime: '', servings: '', videoUrl: '', notes: '',
	cover: noPhoto(),
	ingredients: [{ heading: null, rows: [{ name: 'Pasta', amount: '200', unit: 'g' }] }],
	instructions: steps({ key: 's1', id: 's1', description: 'Boil', photo: noPhoto() }),
	...overrides,
})

describe('toRecipeFormValues', () => {
	const ingredient = { preparation: null, note: null, heading: null }
	const detail = recipeDetailFixture({
		title: 'Layered Cake',
		description: 'Sweet and soft.',
		categories: [{ id: 'category-desserts', name: 'Desserts' }, { id: 'category-breakfast', name: 'Breakfast' }, { id: 'category-snacks', name: 'Snacks' }],
		imageUrl: 'https://storage.example/cover.jpg',
		servings: 8,
		prepTimeMinutes: 0,
		cookTimeMinutes: 40,
		notes: 'Line one\nLine two',
		videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
		ingredients: [
			{ ...ingredient, id: 'i2', ingredientId: 'b2', name: 'Sugar', quantity: 1.5, unit: 'cup', sortOrder: 1 },
			{ ...ingredient, id: 'i1', ingredientId: 'b1', name: 'Flour', quantity: 0.12, unit: 'g', sortOrder: 0 },
			{ ...ingredient, id: 'i3', ingredientId: 'b3', name: 'Salt', quantity: null, unit: null, sortOrder: 2 },
		],
		instructions: [
			{ id: 's2', stepNumber: 2, description: 'Bake.', imageUrl: 'https://storage.example/step2.jpg', heading: null },
			{ id: 's1', stepNumber: 1, description: 'Mix.', imageUrl: null, heading: null },
		],
	})
	const grouped = recipeDetailFixture({
		ingredients: [
			{ ...ingredient, id: 'i1', ingredientId: 'b1', name: 'Pasta', quantity: 200, unit: 'g', sortOrder: 0 },
			{ ...ingredient, id: 'i2', ingredientId: 'b2', name: 'Butter', quantity: 0.333, unit: 'cup', sortOrder: 1, heading: 'Sauce' },
			{ ...ingredient, id: 'i3', ingredientId: 'b3', name: 'Cream', quantity: 1.25, unit: 'cup', sortOrder: 2 },
		],
		instructions: [
			{ id: 's1', stepNumber: 1, description: 'Boil.', imageUrl: null, heading: 'Prep' },
			{ id: 's2', stepNumber: 2, description: 'Melt.', imageUrl: 'https://storage.example/s2.jpg', heading: 'Make the sauce' },
		],
	})

	it('turns numbers into the strings the form edits and keeps the stored category order', () => {
		const values = toRecipeFormValues(detail)
		expect(values).toMatchObject({
			title: 'Layered Cake', description: 'Sweet and soft.', categories: ['category-desserts', 'category-breakfast', 'category-snacks'],
			prepTime: '0', cookTime: '40', servings: '8', videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', notes: 'Line one\nLine two',
		})
	})

	it('maps ingredients in stored order, fractions and other decimals as amount text and a missing quantity to "to taste"', () => {
		expect(toRecipeFormValues(detail).ingredients).toEqual([{ heading: null, rows: [
			{ name: 'Flour', amount: '0.12', unit: 'g' },
			{ name: 'Sugar', amount: '1½', unit: 'cup' },
			{ name: 'Salt', amount: '', unit: TO_TASTE },
		] }])
	})

	it('maps steps in step order with their ids and stored photos, and the stored cover', () => {
		const values = toRecipeFormValues(detail)
		expect(values.instructions).toEqual(steps(
			{ key: 's1', id: 's1', description: 'Mix.', photo: { kind: 'none' } },
			{ key: 's2', id: 's2', description: 'Bake.', photo: { kind: 'existing', url: 'https://storage.example/step2.jpg' } },
		))
		expect(values.cover).toEqual({ kind: 'existing', url: 'https://storage.example/cover.jpg' })
	})

	it('splits rows back into their saved groups, a titled first group included', () => {
		const values = toRecipeFormValues(grouped)
		expect(values.ingredients).toEqual([
			{ heading: null, rows: [{ name: 'Pasta', amount: '200', unit: 'g' }] },
			{ heading: 'Sauce', rows: [{ name: 'Butter', amount: '⅓', unit: 'cup' }, { name: 'Cream', amount: '1¼', unit: 'cup' }] },
		])
		expect(values.instructions).toEqual([
			{ heading: 'Prep', steps: [{ key: 's1', id: 's1', description: 'Boil.', photo: noPhoto() }] },
			{ heading: 'Make the sauce', steps: [{ key: 's2', id: 's2', description: 'Melt.', photo: existingPhoto('https://storage.example/s2.jpg') }] },
		])
	})

	it('maps blank optional fields to empty strings and a missing cover to no photo', () => {
		const values = toRecipeFormValues(recipeDetailFixture())
		expect(values).toMatchObject({ description: '', prepTime: '', cookTime: '', servings: '', videoUrl: '', notes: '', categories: [], cover: { kind: 'none' } })
	})

	it.each([['ungrouped', detail], ['grouped', grouped]])('produces %s values the form accepts unchanged', (_name, recipe) => {
		expect(recipeFormSchema.safeParse(toRecipeFormValues(recipe)).success).toBe(true)
	})

	it('round-trips to metadata that keeps every stored photo, heading and amount', () => {
		const metadata = toUpdateRecipeMetadata(toRecipeFormValues(detail))
		expect(updateRecipeMetadataSchema.safeParse(metadata).success).toBe(true)
		expect(metadata.cover).toBe('keep')
		expect(metadata.instructions).toEqual([
			{ id: 's1', description: 'Mix.', image: 'remove', heading: null },
			{ id: 's2', description: 'Bake.', image: 'keep', heading: null },
		])
		const regrouped = toUpdateRecipeMetadata(toRecipeFormValues(grouped))
		expect(regrouped.ingredients.map(({ quantity, heading }) => ({ quantity, heading }))).toEqual([
			{ quantity: 200, heading: null }, { quantity: 0.333, heading: 'Sauce' }, { quantity: 1.25, heading: null },
		])
		expect(regrouped.instructions.map(({ heading }) => heading)).toEqual(['Prep', 'Make the sauce'])
	})
})

describe('toUpdateRecipeMetadata', () => {
	it('shares the create field rules: trimming, nulls, numbers and "to taste"', () => {
		const metadata = toUpdateRecipeMetadata(base({ prepTime: '10', ingredients: [{ heading: null, rows: [{ name: ' Flour ', amount: '1/2', unit: 'cup' }, { name: 'Salt', amount: '', unit: TO_TASTE }] }] }))
		expect(metadata).toMatchObject({
			title: 'Pasta', description: null, prepTimeMinutes: 10, cookTimeMinutes: null, servings: null, videoUrl: null, notes: null, categoryIds: ['category-dinner'],
			ingredients: [{ name: 'Flour', quantity: 0.5, unit: 'cup', heading: null }, { name: 'Salt', quantity: null, unit: null, heading: null }],
		})
		expect(updateRecipeMetadataSchema.safeParse(metadata).success).toBe(true)
	})

	it('keeps an untouched stored cover and step photo', () => {
		const metadata = toUpdateRecipeMetadata(base({ cover: existingPhoto('https://storage.example/c.jpg'), instructions: steps({ key: 's1', id: 's1', description: 'Boil', photo: existingPhoto('https://storage.example/s1.jpg') }) }))
		expect(metadata.cover).toBe('keep')
		expect(metadata.instructions).toEqual([{ id: 's1', description: 'Boil', image: 'keep', heading: null }])
	})

	it('replaces a slot by naming its Pending photo, for the cover and for an existing step', () => {
		const metadata = toUpdateRecipeMetadata(base({ cover: pendingPhoto(file('new-cover.png'), PHOTO_ID), instructions: steps({ key: 's1', id: 's1', description: 'Boil', photo: pendingPhoto(file('boil.png'), PHOTO_ID) }) }))
		expect(metadata.cover).toEqual({ pendingPhotoId: PHOTO_ID })
		expect(metadata.instructions[0]).toEqual({ id: 's1', description: 'Boil', image: { pendingPhotoId: PHOTO_ID }, heading: null })
	})

	it('removes a slot that was emptied, and also states "remove" for a slot that never had a photo', () => {
		const metadata = toUpdateRecipeMetadata(base())
		expect(metadata.cover).toBe('remove')
		expect(metadata.instructions[0].image).toBe('remove')
	})

	it('sends a new step with no id and either its new photo or "remove"', () => {
		const metadata = toUpdateRecipeMetadata(base({ instructions: steps(
			{ key: 's1', id: 's1', description: 'Boil', photo: existingPhoto('https://storage.example/s1.jpg') },
			{ key: 'new-Serve', id: null, description: 'Serve', photo: pendingPhoto(file('serve.png'), PHOTO_ID) },
			{ key: 'new-Garnish', id: null, description: 'Garnish', photo: noPhoto() },
		) }))
		expect(metadata.instructions.map(({ id, image }) => ({ id, image }))).toEqual([
			{ id: 's1', image: 'keep' }, { id: null, image: { pendingPhotoId: PHOTO_ID } }, { id: null, image: 'remove' },
		])
		expect(updateRecipeMetadataSchema.safeParse(metadata).success).toBe(true)
	})

	it('lets a stored photo follow its step when steps are reordered, also into another group', () => {
		const metadata = toUpdateRecipeMetadata(base({ instructions: [
			{ heading: null, steps: [{ key: 's3', id: 's3', description: 'Boil', photo: noPhoto() }] },
			{ heading: ' Serve ', steps: [{ key: 's2', id: 's2', description: 'Plate', photo: existingPhoto('https://storage.example/s2.jpg') }, { key: 's1', id: 's1', description: 'Top', photo: noPhoto() }] },
		] }))
		expect(metadata.instructions).toEqual([
			{ id: 's3', description: 'Boil', image: 'remove', heading: null },
			{ id: 's2', description: 'Plate', image: 'keep', heading: 'Serve' },
			{ id: 's1', description: 'Top', image: 'remove', heading: null },
		])
	})

	it('drops a deleted step and its photo by leaving it out', () => {
		const metadata = toUpdateRecipeMetadata(base({ instructions: steps({ key: 's2', id: 's2', description: 'Serve', photo: existingPhoto('https://storage.example/s2.jpg') }) }))
		expect(metadata.instructions.map((step) => step.id)).toEqual(['s2'])
	})
})
