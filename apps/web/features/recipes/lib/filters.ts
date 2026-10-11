import { RECIPE_SORT_FIELDS } from '@recipe-app/contracts/types'
import type { Category, RecipeFilters } from '@recipe-app/contracts/types'
import { recipeSearchSchema } from '@recipe-app/contracts/schemas'
import { createLoader, parseAsString, parseAsStringLiteral, type SearchParams } from 'nuqs/server'

export const recipeParsers = {
	search: parseAsString,
	category: parseAsString,
	favorites: parseAsStringLiteral(['true'] as const),
	sortBy: parseAsStringLiteral(RECIPE_SORT_FIELDS).withDefault('createdAt'),
	order: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('desc'),
}

export const recipeUrlOptions = { shallow: true, history: 'push', clearOnDefault: true } as const
const loadFilters = createLoader(recipeParsers)

export class RecipeFilterError extends Error {
	constructor(options?: ErrorOptions) {
		super('Use search up to 200 characters, favorites=true, sortBy (createdAt, updatedAt, title), and order (asc, desc), or reset filters.', options)
		this.name = 'RecipeFilterError'
	}
}

/** Nuqs uses the first repeated value; reject ambiguity and allow blank search only. */
function isInvalidValue(values: string[], allowBlank: boolean): boolean {
	return values.length > 1 || (!allowBlank && values.includes(''))
}

/** Every value the URL carries for a key; none when the key is absent. */
function valuesOf(input: SearchParams | URLSearchParams, key: string): string[] {
	if (input instanceof URLSearchParams) return input.getAll(key)
	const value = input[key]
	return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function validateFilterValues(input: SearchParams | URLSearchParams): void {
	for (const key of Object.keys(recipeParsers)) {
		// A category that cannot be used is dropped, never reported: see `loadRecipeFilters`.
		if (key !== 'category' && isInvalidValue(valuesOf(input, key), key === 'search')) throw new RecipeFilterError()
	}
}

export type LoadedRecipeFilters = {
	filters: RecipeFilters
	/** The URL carried a `category` that is not exactly one of the user's categories; the list shows All and the parameter should go. */
	ignoredCategory: boolean
}

/**
 * Category ids change with the user's own edits (and old links outlive deleted categories), so a malformed, unknown or foreign
 * `category` quietly falls back to every recipe. Every other invalid parameter throws `RecipeFilterError`.
 */
export function loadRecipeFilters(input: SearchParams | URLSearchParams, categories: readonly Pick<Category, 'id'>[]): LoadedRecipeFilters {
	validateFilterValues(input)
	const requested = valuesOf(input, 'category')
	const category = requested.length === 1 ? categories.find(({ id }) => id === requested[0])?.id : undefined
	try {
		const filters = loadFilters(input, { strict: true })
		const search = recipeSearchSchema.parse(filters.search ?? undefined)
		return {
			filters: { ...filters, search, category, favorites: filters.favorites ? true : undefined },
			ignoredCategory: requested.length > 0 && category === undefined,
		}
	} catch (cause) {
		throw new RecipeFilterError({ cause })
	}
}

/** The loaded filters, or the error to show in their place. */
export function readRecipeFilters(input: URLSearchParams, categories: readonly Pick<Category, 'id'>[]): LoadedRecipeFilters | RecipeFilterError {
	try {
		return loadRecipeFilters(input, categories)
	} catch (error) {
		if (!(error instanceof RecipeFilterError)) throw error
		return error
	}
}
