'use client'

import type { ReactNode } from 'react'

import { ToastProvider, Toaster } from '@/components/ui/toast'

/** Mounted once in the private layout so any page below it can toast and one region renders them all. */
export function AppToaster({ children }: { children: ReactNode }) {
	return (
		<ToastProvider>
			{children}
			<Toaster />
		</ToastProvider>
	)
}
