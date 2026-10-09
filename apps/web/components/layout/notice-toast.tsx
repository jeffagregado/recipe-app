'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { NOTICE_PARAM, noticeMessage, urlWithoutNotice } from '@/lib/notice'
import { useAppToast } from '@/lib/use-app-toast'

/**
 * Shows the one-time `?notice=<code>` message that a redirect carries, then removes only that parameter
 * so a reload or Back does not repeat it. Renders nothing; mount it inside its own Suspense boundary.
 */
export function NoticeToast() {
	const router = useRouter()
	const pathname = usePathname()
	const searchParams = useSearchParams()
	const toast = useAppToast()
	const notice = searchParams.get(NOTICE_PARAM)
	// Effects can run twice (Strict Mode, preserved pages) before the URL update lands; remember what was handled.
	const handled = useRef<string | null>(null)

	useEffect(() => {
		if (notice === null) {
			handled.current = null
			return
		}
		if (handled.current === notice) return
		handled.current = notice

		const message = noticeMessage(notice)
		if (message) toast.success(message)
		router.replace(urlWithoutNotice(pathname, searchParams, window.location.hash), { scroll: false })
	}, [notice, pathname, router, searchParams, toast])

	return null
}
