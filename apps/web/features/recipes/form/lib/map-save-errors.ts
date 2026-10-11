/** Server and shared-schema field keys are dotted metadata paths; the form uses its own (string-valued) field names. */
const SIMPLE_FIELDS = new Set(['title', 'description', 'categories', 'servings', 'videoUrl', 'notes', 'cover', 'ingredients', 'instructions'])
const RENAMED_FIELDS: Record<string, string> = { prepTimeMinutes: 'prepTime', cookTimeMinutes: 'cookTime' }
const INGREDIENT_FIELDS: Record<string, string> = { name: 'name', quantity: 'amount', unit: 'unit' }
const INSTRUCTION_FIELDS: Record<string, string> = { description: 'description', hasImage: 'photo', image: 'photo' }

/** Returns the form field path for an API/metadata field key, or null when it has no matching form field. */
export function toFormFieldPath(key: string): string | null {
	const [head, second, third] = key.split('.')
	if (SIMPLE_FIELDS.has(head) && second === undefined) return head
	if (head === 'categories' || head === 'categoryIds') return 'categories'
	if (head in RENAMED_FIELDS && second === undefined) return RENAMED_FIELDS[head]
	const index = Number(second)
	if (head === 'ingredients' && Number.isInteger(index) && third in INGREDIENT_FIELDS) return `ingredients.${index}.${INGREDIENT_FIELDS[third]}`
	if (head === 'instructions' && Number.isInteger(index) && third in INSTRUCTION_FIELDS) return `instructions.${index}.${INSTRUCTION_FIELDS[third]}`
	const step = /^step-(\d+)$/.exec(key)
	if (step) return `instructions.${Number(step[1])}.photo`
	return null
}

export type MappedFieldError = { path: string; message: string }

/** Splits API `fieldErrors` into per-field messages and messages that must go in the form-level summary. */
export function mapSaveFieldErrors(fieldErrors: Record<string, string[]>): { fields: MappedFieldError[]; unmapped: string[] } {
	const fields: MappedFieldError[] = []
	const unmapped: string[] = []
	for (const [key, messages] of Object.entries(fieldErrors)) {
		const message = messages[0]
		if (!message) continue
		const path = toFormFieldPath(key)
		if (path) fields.push({ path, message })
		else unmapped.push(message)
	}
	return { fields, unmapped }
}
