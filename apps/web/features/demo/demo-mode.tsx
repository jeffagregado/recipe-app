'use client'

import { createContext, use, type ReactNode } from 'react'

const DemoModeContext = createContext(false)

/** Set around the signed-in pages, on with `isDemoMode()`, so client components can switch off what the demo does not offer. */
export function DemoModeProvider({ enabled = true, children }: { enabled?: boolean; children: ReactNode }) {
	return <DemoModeContext value={enabled}>{children}</DemoModeContext>
}

/** Whether this page belongs to the demo site. The server reads the switch itself, with `isDemoMode`. */
export const useDemoMode = () => use(DemoModeContext)

/** Shown where a photo would be picked: the demo API refuses uploads and photo removal. */
export const PHOTO_UPLOADS_OFF = 'Photo uploads are off in the demo'
