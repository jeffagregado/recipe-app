const MAX_RECIPE_ID_LENGTH = 200

/** Recipe ids come from the browser (and the URL); only forward ones the API could possibly own. */
export function isValidRecipeId(id: unknown): id is string {
	return typeof id === 'string' && id.length > 0 && id.length <= MAX_RECIPE_ID_LENGTH && !id.includes('\u0000')
}
