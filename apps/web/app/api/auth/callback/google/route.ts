import type { NextRequest } from 'next/server'
import { handleGoogleCallback } from '@/features/auth/google-callback'

/** The redirect URI registered with Google points here, on the web origin, and never at the API. */
export function GET(request: NextRequest) {
	return handleGoogleCallback(request)
}
