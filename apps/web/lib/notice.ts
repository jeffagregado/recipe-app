/** One-time toast messages passed through a redirect as `?notice=<code>`; Server Actions and the client reader share these codes. */
export const NOTICE_PARAM = 'notice'

export const NOTICE_MESSAGES = {
	'recipe-saved': 'Recipe saved',
	'recipe-updated': 'Recipe updated',
	'recipe-deleted': 'Recipe deleted',
} as const

export type NoticeCode = keyof typeof NOTICE_MESSAGES

/** Message for a known code; unknown codes (including prototype keys) return null. */
export function noticeMessage(code: string | null): string | null {
	return code !== null && Object.hasOwn(NOTICE_MESSAGES, code) ? NOTICE_MESSAGES[code as NoticeCode] : null
}

/** Builds a redirect target that shows the notice once on arrival. */
export function withNotice(path: `/${string}`, code: NoticeCode): string {
	return `${path}${path.includes('?') ? '&' : '?'}${NOTICE_PARAM}=${code}`
}

/** The current URL without the notice parameter; every other parameter and the hash are kept. */
export function urlWithoutNotice(pathname: string, searchParams: URLSearchParams, hash: string): string {
	const rest = new URLSearchParams(searchParams)
	rest.delete(NOTICE_PARAM)
	const query = rest.toString()
	return `${pathname}${query ? `?${query}` : ''}${hash}`
}
