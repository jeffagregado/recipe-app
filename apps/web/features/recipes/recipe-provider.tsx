'use client'

import { HydrationBoundary, QueryClient, QueryClientProvider, type DehydratedState } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

export function RecipeProvider({ children, state }: { children: ReactNode; state: DehydratedState }) {
	const [client] = useState(() => new QueryClient())
	return <QueryClientProvider client={client}><HydrationBoundary state={state}>{children}</HydrationBoundary></QueryClientProvider>
}
