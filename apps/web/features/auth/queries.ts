import 'server-only'

import { authSessionResponseSchema } from '@recipe-app/contracts/schemas'
import type { AuthSessionResponse } from '@recipe-app/contracts/types'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { authFetch } from './api'
import { AuthServiceError } from './errors'
import { sessionCookieHeader } from './session-cookie'

type Session = ({ status: 'authenticated' } & AuthSessionResponse) | { status: 'anonymous' }

/** Per-render dedupe only; no session or private data enters a shared cache. */
export const getSession = cache(async (): Promise<Session> => {
	const cookie = sessionCookieHeader(await cookies())
	if (!cookie) return { status: 'anonymous' }
	const response = await authFetch('/auth/session', { headers: { Cookie: cookie } })
	if (response.status === 401) return { status: 'anonymous' }
	if (response.status !== 200) throw new AuthServiceError(`Session service failed with HTTP ${response.status}.`)
	let payload: unknown
	try { payload = await response.json() } catch { throw new AuthServiceError('Session service returned invalid JSON.') }
	const result = authSessionResponseSchema.safeParse(payload)
	if (!result.success) throw new AuthServiceError('Session service returned invalid session data.')
	return { status: 'authenticated', ...result.data }
})

export async function requireSession() {
	const session = await getSession()
	if (session.status === 'anonymous') redirect('/')
	return session
}
