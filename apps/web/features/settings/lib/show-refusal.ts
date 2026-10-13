import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'

/** What a Settings action answers when it did nothing: a message for one field, or one for the whole card. */
type Refusal<Field> =
	| { status: 'invalid'; field: Field; message: string }
	| { status: 'session-expired' | 'failed'; message: string }

type RefusalTargets<Values extends FieldValues> = {
	form: UseFormReturn<Values>
	toast: { error: (message: string) => void }
	/** Shows a message that belongs to no field inside the card. */
	setAlert: (message: string) => void
	/** The toast for a refusal whose own message is shown on its field. */
	failed: string
}

/** Puts a field's message on that field and focuses it, or explains the refusal inside the card; either way a toast says it failed. */
export function showRefusal<Values extends FieldValues>(result: Refusal<Path<Values>>, { form, toast, setAlert, failed }: RefusalTargets<Values>) {
	toast.error(result.status === 'invalid' ? failed : result.message)
	if (result.status === 'invalid') form.setError(result.field, { type: 'server', message: result.message }, { shouldFocus: true })
	else setAlert(result.message)
}
