import type { RecipeDetail } from '@recipe-app/contracts/types'

export type RecipeTime = { label: 'Prep' | 'Cook' | 'Total'; minutes: number }

/** Prep, cook and (only when both exist) total time; zero minutes is a value, only null is omitted. */
export function recipeTimes({ prepTimeMinutes, cookTimeMinutes }: Pick<RecipeDetail, 'prepTimeMinutes' | 'cookTimeMinutes'>): RecipeTime[] {
	const times: RecipeTime[] = []
	if (prepTimeMinutes !== null) times.push({ label: 'Prep', minutes: prepTimeMinutes })
	if (cookTimeMinutes !== null) times.push({ label: 'Cook', minutes: cookTimeMinutes })
	if (prepTimeMinutes !== null && cookTimeMinutes !== null) times.push({ label: 'Total', minutes: prepTimeMinutes + cookTimeMinutes })
	return times
}

export function servingsLabel(servings: number): string {
	return `${servings} ${servings === 1 ? 'serving' : 'servings'}`
}
