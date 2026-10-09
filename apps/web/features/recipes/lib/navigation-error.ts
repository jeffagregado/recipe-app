import { unstable_rethrow } from 'next/navigation'

/** Returns the redirect or not-found error Next throws out of a Server Action, or null for ordinary failures. */
export function navigationError(error: unknown): unknown {
	try { unstable_rethrow(error) } catch (navigation) { return navigation }
	return null
}
