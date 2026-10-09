'use client'

import { useEffect } from 'react'
import { observeSession } from './session-monitor'

export function SessionFreshness({ userId }: { userId: string }) {
	useEffect(() => observeSession(userId), [userId])
	return null
}
