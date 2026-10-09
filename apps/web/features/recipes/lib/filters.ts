import { RECIPE_CATEGORIES, RECIPE_SORT_FIELDS } from '@recipe-app/contracts/types'
import type { RecipeFilters } from '@recipe-app/contracts/types'
import { recipeSearchSchema } from '@recipe-app/contracts/schemas'
import { createLoader, parseAsString, parseAsStringLiteral, type SearchParams } from 'nuqs/server'

export const recipeParsers = {
	search: parseAsString,
	category: parseAsStringLiteral(RECIPE_CATEGORIES),
	sortBy: parseAsStringLiteral(RECIPE_SORT_FIELDS).withDefault('createdAt'),
	order: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('desc'),
}

export const recipeUrlOptions = { shallow: true, history: 'push', clearOnDefault: true } as const
const loadFilters = createLoader(recipeParsers)

export class RecipeFilterError extends Error {
	constructor(options?: ErrorOptions) {
		super('Use search up to 200 characters, a supported category, sortBy (createdAt, updatedAt, title), and order (asc, desc), or reset filters.', options)
		this.name = 'RecipeFilterError'
	}
}

/** Nuqs uses the first repeated value; reject ambiguity and allow blank search only. */
function isInvalidValue(value: string | string[] | undefined, allowBlank: boolean): boolean {
	const values = Array.isArray(value) ? value : [value]
	return values.length > 1 || (!allowBlank && values.includes(''))
}

function validateFilterValues(input: SearchParams | URLSearchParams): void {
	for (const key of Object.keys(recipeParsers)) {
		const value = input instanceof URLSearchParams ? input.getAll(key) : input[key]
		if (isInvalidValue(value, key === 'search')) throw new RecipeFilterError()
	}
}

export function loadRecipeFilters(input: SearchParams | URLSearchParams): RecipeFilters {
	validateFilterValues(input)
	try {
		const filters = loadFilters(input, { strict: true })
		const search = recipeSearchSchema.parse(filters.search ?? undefined)
		return { ...filters, search, category: filters.category ?? undefined }
	} catch (cause) {
		throw new RecipeFilterError({ cause })
	}
}

export function recipeFilterError(input: URLSearchParams): RecipeFilterError | null {
	try {
		loadRecipeFilters(input)
		return null
	} catch (error) {
		if (!(error instanceof RecipeFilterError)) throw error
		return error
	}
}
