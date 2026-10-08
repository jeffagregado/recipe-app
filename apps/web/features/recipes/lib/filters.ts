import { RECIPE_CATEGORIES, RECIPE_SORT_FIELDS } from '@recipe-app/contracts/types'
import type { RecipeFilters } from '@recipe-app/contracts/types'
import { createLoader, parseAsStringLiteral, type SearchParams } from 'nuqs/server'

export const recipeParsers = {
	category: parseAsStringLiteral(RECIPE_CATEGORIES),
	sortBy: parseAsStringLiteral(RECIPE_SORT_FIELDS).withDefault('createdAt'),
	order: parseAsStringLiteral(['asc', 'desc'] as const).withDefault('desc'),
}

export const recipeUrlOptions = { shallow: true, history: 'push', clearOnDefault: true } as const
const loadFilters = createLoader(recipeParsers)

export class RecipeFilterError extends Error {
	constructor(options?: ErrorOptions) {
		super('Choose a supported category, sortBy (createdAt, updatedAt, title), and order (asc, desc), or reset filters.', options)
		this.name = 'RecipeFilterError'
	}
}

/** Also reject blank/repeated values, which single Nuqs parsers treat as absent/first. */
function isInvalidValue(value: string | string[] | undefined): boolean {
	if (Array.isArray(value)) return value.length > 1 || value.includes('')
	return value === ''
}

function validateFilterValues(input: SearchParams | URLSearchParams): void {
	for (const key of Object.keys(recipeParsers)) {
		const value = input instanceof URLSearchParams ? input.getAll(key) : input[key]
		if (isInvalidValue(value)) throw new RecipeFilterError()
	}
}

export function loadRecipeFilters(input: SearchParams | URLSearchParams): RecipeFilters {
	validateFilterValues(input)
	try {
		const filters = loadFilters(input, { strict: true })
		return { ...filters, category: filters.category ?? undefined }
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
