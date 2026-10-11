import { createRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { MEASUREMENT_UNITS, RECIPE_LIMITS, type CreateRecipeMetadata } from '@recipe-app/contracts/types'
import { z } from 'zod'
import { toFormFieldPath } from './map-save-errors'
import { checkRecipeImage } from './recipe-files'
import { isPhotoValue, noPhoto, type PhotoValue } from './recipe-photo'

export const TO_TASTE = 'to-taste'
export const MAX_ROWS = { ingredients: RECIPE_LIMITS.ingredients, instructions: RECIPE_LIMITS.instructions }

type AmountResult = { ok: true; value: number } | { ok: false; message: string }

/** Amounts are typed as text so fractions like `1/2` can be explained instead of silently coerced. */
export function parseAmount(text: string): AmountResult {
	const value = text.trim()
	const fail = (message: string): AmountResult => ({ ok: false, message })
	if (value.includes('/')) return fail('Use a decimal such as 0.5 instead of a fraction like 1/2.')
	if (!/^(\d+\.?\d*|\.\d+)$/.test(value)) return fail('Enter a number, for example 1.5.')
	if ((value.split('.')[1] ?? '').length > RECIPE_LIMITS.quantityDecimals) return fail(`Use at most ${RECIPE_LIMITS.quantityDecimals} decimal places.`)
	const amount = Number(value)
	if (amount <= 0) return fail('Amount must be greater than 0.')
	if (amount > RECIPE_LIMITS.maxQuantity) return fail('Amount can’t be more than 999,999,999.999.')
	return { ok: true, value: amount }
}

const isWholeNumber = (value: string, minimum: number) => /^\d+$/.test(value) && Number(value) >= minimum && Number(value) <= RECIPE_LIMITS.maxInteger
const isHttpsUrl = (value: string) => {
	try { return new URL(value).protocol === 'https:' } catch { return false }
}
const formatLimit = (limit: number) => limit.toLocaleString('en-US')
const optionalText = (limit: number) => z.string().trim().max(limit, `Use ${formatLimit(limit)} characters or fewer.`)
const optionalWhole = (message: string, minimum: number) => z.string().trim().refine((value) => value === '' || isWholeNumber(value, minimum), message)

const ingredientRowSchema = z.object({
	name: z.string(),
	amount: z.string(),
	unit: z.enum(['', TO_TASTE, ...MEASUREMENT_UNITS]),
}).superRefine((row, ctx) => {
	const name = row.name.trim()
	if (!name) ctx.addIssue({ code: 'custom', path: ['name'], message: 'Add an ingredient name.' })
	else if (name.length > RECIPE_LIMITS.ingredientName) ctx.addIssue({ code: 'custom', path: ['name'], message: `Use ${RECIPE_LIMITS.ingredientName} characters or fewer.` })
	if (row.unit === TO_TASTE) return
	if (!row.amount.trim()) {
		ctx.addIssue({ code: 'custom', path: ['amount'], message: row.unit === '' ? 'Enter an amount, or choose “to taste”.' : 'Enter an amount.' })
		return
	}
	const amount = parseAmount(row.amount)
	if (!amount.ok) ctx.addIssue({ code: 'custom', path: ['amount'], message: amount.message })
	else if (row.unit === '') ctx.addIssue({ code: 'custom', path: ['unit'], message: 'Choose a unit.' })
})

// Stored photos were checked when they were uploaded; only a file picked in this session needs checking.
const photoSchema = z.custom<PhotoValue>(isPhotoValue, 'Choose an image file.').superRefine((photo, ctx) => {
	const problem = photo.kind === 'new' ? checkRecipeImage(photo.file) : null
	if (problem) ctx.addIssue({ code: 'custom', message: problem })
})

const instructionRowSchema = z.object({
	/** The stored step this row continues; null for a row added in this session. */
	id: z.string().nullable(),
	description: z.string().trim()
		.min(1, 'Describe this step.')
		.max(RECIPE_LIMITS.instructionDescription, `Use ${formatLimit(RECIPE_LIMITS.instructionDescription)} characters or fewer.`),
	photo: photoSchema,
})

export const recipeFormSchema = z.object({
	title: z.string().trim().min(1, 'Add a title before saving.').max(RECIPE_LIMITS.title, `Use ${RECIPE_LIMITS.title} characters or fewer.`),
	description: optionalText(RECIPE_LIMITS.description),
	/** Ids of the user's own categories, in the order they were chosen. */
	categories: z.array(z.string()).max(RECIPE_LIMITS.categories, `Choose up to ${RECIPE_LIMITS.categories} categories.`),
	prepTime: optionalWhole('Enter whole minutes, for example 10.', 0),
	cookTime: optionalWhole('Enter whole minutes, for example 20.', 0),
	servings: optionalWhole('Enter a whole number of servings, 1 or more.', 1),
	videoUrl: z.string().trim()
		.max(RECIPE_LIMITS.videoUrl, `Use ${formatLimit(RECIPE_LIMITS.videoUrl)} characters or fewer.`)
		.refine((value) => value === '' || isHttpsUrl(value), 'Enter a link that starts with https://'),
	cover: photoSchema,
	ingredients: z.array(ingredientRowSchema)
		.min(1, 'Add at least one ingredient.')
		.max(RECIPE_LIMITS.ingredients, `Use ${RECIPE_LIMITS.ingredients} ingredients or fewer.`),
	instructions: z.array(instructionRowSchema)
		.min(1, 'Add at least one step.')
		.max(RECIPE_LIMITS.instructions, `Use ${RECIPE_LIMITS.instructions} steps or fewer.`),
	notes: optionalText(RECIPE_LIMITS.notes),
}).check((ctx) => {
	// Backstop: whatever the friendly checks above miss must still satisfy the API's schema.
	if (ctx.issues.length > 0) return
	const result = createRecipeMetadataSchema.safeParse(toCreateRecipeMetadata(ctx.value))
	if (result.success) return
	for (const issue of result.error.issues) {
		const path = toFormFieldPath(issue.path.join('.'))
		ctx.issues.push({ code: 'custom', input: ctx.value, path: path?.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)) ?? [], message: issue.message })
	}
})

export type RecipeFormValues = z.infer<typeof recipeFormSchema>
export type IngredientFormRow = RecipeFormValues['ingredients'][number]
export type InstructionFormRow = RecipeFormValues['instructions'][number]

export const emptyIngredientRow = (): IngredientFormRow => ({ name: '', amount: '', unit: '' })
export const emptyInstructionRow = (): InstructionFormRow => ({ id: null, description: '', photo: noPhoto() })

export function createEmptyRecipeValues(): RecipeFormValues {
	return {
		title: '', description: '', categories: [], prepTime: '', cookTime: '', servings: '', videoUrl: '', cover: noPhoto(),
		ingredients: [emptyIngredientRow()], instructions: [emptyInstructionRow()], notes: '',
	}
}

const blankToNull = (text: string) => text.trim() || null
const wholeNumberOrNull = (text: string) => {
	const value = text.trim()
	if (!value) return null
	return /^\d+$/.test(value) ? Number(value) : Number.NaN
}

/** The metadata fields create and update share. Invalid numbers become NaN so the shared schema rejects them. */
export function toSharedMetadata(values: RecipeFormValues): Omit<CreateRecipeMetadata, 'instructions'> {
	return {
		title: values.title.trim(),
		description: blankToNull(values.description),
		categoryIds: values.categories,
		servings: wholeNumberOrNull(values.servings),
		prepTimeMinutes: wholeNumberOrNull(values.prepTime),
		cookTimeMinutes: wholeNumberOrNull(values.cookTime),
		videoUrl: blankToNull(values.videoUrl),
		notes: blankToNull(values.notes),
		ingredients: values.ingredients.map((row) => {
			const name = row.name.trim()
			if (row.unit === TO_TASTE || row.unit === '') return { name, quantity: null, unit: null }
			const amount = parseAmount(row.amount)
			return { name, quantity: amount.ok ? amount.value : Number.NaN, unit: row.unit }
		}),
	}
}

export function toCreateRecipeMetadata(values: RecipeFormValues): CreateRecipeMetadata {
	return {
		...toSharedMetadata(values),
		instructions: values.instructions.map((step) => ({ description: step.description.trim(), hasImage: step.photo.kind === 'new' })),
	}
}
