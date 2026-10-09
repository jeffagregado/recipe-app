'use client'

import { Toast } from '@base-ui/react/toast'

const SUCCESS_TIMEOUT_MS = 5_000

/** App-wide toasts: success auto-dismisses and is announced politely; error persists until dismissed and is announced urgently. */
export function useAppToast() {
	const { add } = Toast.useToastManager()

	return {
		success: (message: string) => add({ title: message, type: 'success', priority: 'low', timeout: SUCCESS_TIMEOUT_MS }),
		error: (message: string) => add({ title: message, type: 'error', priority: 'high', timeout: 0 }),
	}
}
