import 'server-only'

import { categoryListSchema } from '@recipe-app/contracts/schemas'
import type { CategoryWithUsage } from '@recipe-app/contracts/types'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getApiOrigin } from '@/features/auth/api'
import { requireSession } from '@/features/auth/queries'
import { sessionCookieHeader } from '@/features/auth/session-cookie'

const REQUEST_TIMEOUT_MS = 20_000

class CategoryReadError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'CategoryReadError'
	}
}

async function fetchCategories(cookie: string): Promise<Response> {
	const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
	try {
		return await fetch(`${getApiOrigin()}/categories`, { cache: 'no-store', redirect: 'error', signal, headers: { Cookie: cookie } })
	} catch (cause) {
		if (signal.aborted) throw new CategoryReadError(`GET /categories timed out after ${REQUEST_TIMEOUT_MS / 1_000} seconds. Check recipe API availability.`, { cause })
		if (cause instanceof TypeError || cause instanceof DOMException) throw new CategoryReadError('GET /categories failed during transport. Check recipe API availability.', { cause })
		throw cause
	}
}

/** Uncached owner-scoped read: the signed-in user's categories in their order, each with its recipe count. */
export async function getCategories(): Promise<CategoryWithUsage[]> {
	await requireSession()
	const response = await fetchCategories(sessionCookieHeader(await cookies()))
	if (response.status === 401) redirect('/')
	if (!response.ok) throw new CategoryReadError(`GET /categories failed (${response.status}). Check the recipe API response.`)
	let payload: unknown
	try { payload = await response.json() } catch (cause) { throw new CategoryReadError('GET /categories returned invalid JSON. Check the recipe API response.', { cause }) }
	const result = categoryListSchema.safeParse(payload)
	if (!result.success) throw new CategoryReadError('GET /categories returned invalid category data. Check the recipe API response.', { cause: result.error })
	return result.data
}
