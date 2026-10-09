/** 44px controls on this form at every width; the shared Input stays 32px. */
export const inputClass = 'h-11 min-h-11 scroll-mt-24 px-3 text-base md:text-base'
export const textareaClass = 'block min-h-24 w-full scroll-mt-24 rounded-lg border border-input bg-transparent px-3 py-2.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30'
export const selectClass = 'h-11 min-h-11 w-full min-w-0 scroll-mt-24 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30'

export type FieldA11yProps = { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }

/** Links a control to its hint and error text. */
export function fieldA11y(id: string, error?: string, hint?: boolean): FieldA11yProps {
	const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ')
	return { id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy || undefined }
}
