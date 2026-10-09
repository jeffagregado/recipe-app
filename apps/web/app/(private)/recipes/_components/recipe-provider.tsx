'use client'

import { HydrationBoundary, QueryClient, QueryClientProvider, type DehydratedState } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { registerPrivateQueries } from '@/features/auth/session-client'

export function RecipeProvider({ children, state }: { children: ReactNode; state: DehydratedState }) {
	const [client] = useState(() => new QueryClient())
	useEffect(() => registerPrivateQueries(client), [client])
	return <QueryClientProvider client={client}><HydrationBoundary state={state}>{children}</HydrationBoundary></QueryClientProvider>
}
