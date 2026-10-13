'use client'

import type { ReactNode } from 'react'

import { ToastProvider, Toaster } from '@/components/ui/toast'

/** Mounted once per tree, in the private layout and on the login page, so anything below it can toast and one region renders them all. */
export function AppToaster({ children }: { children: ReactNode }) {
	return (
		<ToastProvider>
			{children}
			<Toaster />
		</ToastProvider>
	)
}
