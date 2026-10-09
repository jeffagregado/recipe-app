import type { ReactNode } from 'react'

import { requireSession } from '@/features/auth/queries'

/** Keeps session failures in SessionErrorBoundary, apart from recipe read failures. */
export async function RecipeDetailSession({ children }: { children: ReactNode }) {
	await requireSession()
	return children
}
