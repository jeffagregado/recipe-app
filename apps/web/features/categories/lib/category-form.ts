import { normalizeCategoryName, saveCategoriesSchema } from '@recipe-app/contracts/schemas'
import { RECIPE_LIMITS, type CategoryWithUsage, type SaveCategoryInput } from '@recipe-app/contracts/types'
import { z } from 'zod'

export const MAX_CATEGORIES = RECIPE_LIMITS.categoriesPerUser
export const MAX_NAME_LENGTH = RECIPE_LIMITS.categoryName

/** One editable row: a stored category keeps its id, a row added in this session has none yet. */
export type CategoryFormRow = { categoryId: string | null; name: string }
export type CategoryFormValues = { categories: CategoryFormRow[] }

export const emptyCategoryRow = (): CategoryFormRow => ({ categoryId: null, name: '' })

export function toCategoryFormValues(categories: readonly CategoryWithUsage[]): CategoryFormValues {
	return { categories: categories.map(({ id, name }) => ({ categoryId: id, name })) }
}

/** The whole set as the API takes it; names are sent as typed and normalized by the shared schema. */
export function toSaveCategoriesInput(values: CategoryFormValues): SaveCategoryInput[] {
	return values.categories.map(({ categoryId, name }) => (categoryId === null ? { name } : { id: categoryId, name }))
}

/** The form holds the rows; every rule about names and the set comes from the shared schema, placed on the row it names. */
export const categoryFormSchema = z.object({
	categories: z.array(z.object({ categoryId: z.string().nullable(), name: z.string() })),
}).check((ctx) => {
	const result = saveCategoriesSchema.safeParse(toSaveCategoriesInput(ctx.value))
	if (result.success) return
	for (const issue of result.error.issues) {
		const [index] = issue.path
		ctx.issues.push({ code: 'custom', input: ctx.value, path: typeof index === 'number' ? ['categories', index, 'name'] : ['categories'], message: issue.message })
	}
})

/** Characters the name will occupy once saved, for the counter beside the input. */
export const savedNameLength = (name: string) => normalizeCategoryName(name).length

/** Stored categories the edited list no longer contains and that still tag at least one recipe. */
export function removedInUse(stored: readonly CategoryWithUsage[], rows: readonly CategoryFormRow[]): CategoryWithUsage[] {
	return stored.filter(({ id, recipeCount }) => recipeCount > 0 && !rows.some((row) => row.categoryId === id))
}

/** Puts `restored` back where they were: stored categories keep their original order and new rows stay at the end. */
export function restoreCategories(stored: readonly CategoryWithUsage[], rows: readonly CategoryFormRow[], restored: readonly CategoryWithUsage[]): CategoryFormRow[] {
	const kept = stored.flatMap(({ id, name }) => {
		const row = rows.find(({ categoryId }) => categoryId === id)
		if (row) return [row]
		return restored.some((category) => category.id === id) ? [{ categoryId: id, name }] : []
	})
	return [...kept, ...rows.filter(({ categoryId }) => categoryId === null)]
}

export const recipeCountLabel = (count: number) => `${count} ${count === 1 ? 'recipe' : 'recipes'}`
