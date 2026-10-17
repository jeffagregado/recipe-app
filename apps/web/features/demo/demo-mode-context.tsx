'use client'

import { createContext, use, type ReactNode } from 'react'

const DemoModeContext = createContext(false)

/** Set around the signed-in pages, on with `isDemoMode()`, so client components can switch off what the demo does not offer. */
export function DemoModeProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
	return <DemoModeContext value={enabled}>{children}</DemoModeContext>
}

/** Whether this page belongs to the demo site. The server reads the switch itself, with `isDemoMode`. */
export const useDemoMode = () => use(DemoModeContext)
