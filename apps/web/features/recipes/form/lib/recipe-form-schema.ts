import { createRecipeMetadataSchema } from '@recipe-app/contracts/schemas'
import { MEASUREMENT_UNITS, RECIPE_LIMITS, type CreateRecipeMetadata } from '@recipe-app/contracts/types'
import { z } from 'zod'
import { KITCHEN_FRACTIONS } from '../../lib/kitchen-amount'
import { toFormFieldPath } from './map-save-errors'
import type { FormGroup } from './row-groups'
import { checkRecipeImage } from './recipe-files'
import { isPhotoValue, noPhoto, type PhotoValue } from './recipe-photo'

export const TO_TASTE = 'to-taste'
export const MAX_ROWS = { ingredients: RECIPE_LIMITS.ingredients, instructions: RECIPE_LIMITS.instructions }

type AmountResult = { ok: true; value: number } | { ok: false; message: string }

const SLASH_FRACTION = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/
const GLYPH_VALUES = new Map<string, number>(KITCHEN_FRACTIONS.map(({ glyph, value }) => [glyph, value]))
const GLYPH_FRACTION = new RegExp(String.raw`^(?:(\d+)\s*)?([${[...GLYPH_VALUES.keys()].join('')}])$`)

/** The value of `1/2`, `1 1/2`, `½` or `1½`; NaN for a zero denominator and null when the text is no fraction. */
function fractionValue(text: string): number | null {
	const slash = SLASH_FRACTION.exec(text)
	if (slash) {
		const denominator = Number(slash[3])
		return denominator === 0 ? Number.NaN : Number(slash[1] ?? 0) + Number(slash[2]) / denominator
	}
	const glyph = GLYPH_FRACTION.exec(text)
	if (!glyph) return null
	return Number(glyph[1] ?? 0) + (GLYPH_VALUES.get(glyph[2]) ?? Number.NaN)
}

/** Amounts are typed as text so kitchen fractions such as `1 1/2` or `½` can be read as well as decimals. */
export function parseAmount(text: string): AmountResult {
	const value = text.trim()
	const fail = (message: string): AmountResult => ({ ok: false, message })
	const fraction = fractionValue(value)
	if (fraction === null ? !/^(\d+\.?\d*|\.\d+)$/.test(value) : Number.isNaN(fraction)) return fail('Enter a number such as 1.5, 1/2 or 1 1/2.')
	if (fraction === null && (value.split('.')[1] ?? '').length > RECIPE_LIMITS.quantityDecimals) return fail(`Use at most ${RECIPE_LIMITS.quantityDecimals} decimal places.`)
	const amount = fraction === null ? Number(value) : Number(fraction.toFixed(RECIPE_LIMITS.quantityDecimals))
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
// A photo that is not yet a Pending photo blocks the save; Save waits for uploads first, so this is a failed one.
const photoSchema = z.custom<PhotoValue>(isPhotoValue, 'Choose an image file.').superRefine((photo, ctx) => {
	if (photo.kind === 'picked') return ctx.addIssue({ code: 'custom', message: 'Retry or remove this photo.' })
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

type GroupLimits = { empty: string; limit: number; noun: string }

/**
 * Rows are kept per group: the first group, untitled while its heading is null, followed by named groups.
 * Every group with a heading needs a name; the row limit counts rows across all groups.
 */
const groupRules = ({ empty, limit, noun }: GroupLimits) => (groups: Array<{ heading: string | null; size: number }>, ctx: z.RefinementCtx) => {
	const total = groups.reduce((count, group) => count + group.size, 0)
	if (total === 0) ctx.addIssue({ code: 'custom', message: empty })
	if (total > limit) ctx.addIssue({ code: 'custom', message: `Use ${limit} ${noun} or fewer.` })
	groups.forEach((group, index) => {
		if (group.heading === null) return
		const heading = group.heading.trim()
		if (!heading) ctx.addIssue({ code: 'custom', path: [index, 'heading'], message: 'Name this group, or remove the heading.' })
		else if (heading.length > RECIPE_LIMITS.groupHeading) ctx.addIssue({ code: 'custom', path: [index, 'heading'], message: `Use ${RECIPE_LIMITS.groupHeading} characters or fewer.` })
	})
}
const ingredientGroupRules = groupRules({ empty: 'Add at least one ingredient.', limit: RECIPE_LIMITS.ingredients, noun: 'ingredients' })
const instructionGroupRules = groupRules({ empty: 'Add at least one step.', limit: RECIPE_LIMITS.instructions, noun: 'steps' })

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
	ingredients: z.array(z.object({ heading: z.string().nullable(), rows: z.array(ingredientRowSchema) }))
		.superRefine((groups, ctx) => ingredientGroupRules(groups.map(({ heading, rows }) => ({ heading, size: rows.length })), ctx)),
	instructions: z.array(z.object({ heading: z.string().nullable(), steps: z.array(instructionRowSchema) }))
		.superRefine((groups, ctx) => instructionGroupRules(groups.map(({ heading, steps }) => ({ heading, size: steps.length })), ctx)),
	notes: optionalText(RECIPE_LIMITS.notes),
}).check((ctx) => {
	// Backstop: whatever the friendly checks above miss must still satisfy the API's schema.
	if (ctx.issues.length > 0) return
	const result = createRecipeMetadataSchema.safeParse(toCreateRecipeMetadata(ctx.value))
	if (result.success) return
	for (const issue of result.error.issues) {
		const path = toFormFieldPath(issue.path.join('.'), ctx.value)
		ctx.issues.push({ code: 'custom', input: ctx.value, path: path?.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)) ?? [], message: issue.message })
	}
})

export type RecipeFormValues = z.infer<typeof recipeFormSchema>
export type IngredientFormGroup = RecipeFormValues['ingredients'][number]
export type InstructionFormGroup = RecipeFormValues['instructions'][number]
export type IngredientFormRow = IngredientFormGroup['rows'][number]
export type InstructionFormRow = InstructionFormGroup['steps'][number]

export const emptyIngredientRow = (): IngredientFormRow => ({ name: '', amount: '', unit: '' })
export const emptyInstructionRow = (): InstructionFormRow => ({ id: null, description: '', photo: noPhoto() })

export function createEmptyRecipeValues(): RecipeFormValues {
	return {
		title: '', description: '', categories: [], prepTime: '', cookTime: '', servings: '', videoUrl: '', cover: noPhoto(),
		ingredients: [{ heading: null, rows: [emptyIngredientRow()] }], instructions: [{ heading: null, steps: [emptyInstructionRow()] }], notes: '',
	}
}

const blankToNull = (text: string) => text.trim() || null
const wholeNumberOrNull = (text: string) => {
	const value = text.trim()
	if (!value) return null
	return /^\d+$/.test(value) ? Number(value) : Number.NaN
}

/** The contract's flat row list: each group's first row carries its trimmed heading, every other row null. */
export function flattenGroups<K extends string, T, R>(groups: FormGroup<K, T>[], key: K, map: (row: T) => R): Array<R & { heading: string | null }> {
	return groups.flatMap((group) => group[key].map((row, index) => ({ ...map(row), heading: index === 0 ? group.heading?.trim() ?? null : null })))
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
		ingredients: flattenGroups(values.ingredients, 'rows', (row) => {
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
		...(values.cover.kind === 'pending' ? { cover: { pendingPhotoId: values.cover.id } } : {}),
		instructions: flattenGroups(values.instructions, 'steps', (step) => ({ description: step.description.trim(), hasImage: step.photo.kind === 'new' })),
	}
}
