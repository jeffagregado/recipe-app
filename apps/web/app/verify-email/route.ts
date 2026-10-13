import { handleVerifyEmail } from '@/features/auth/verify-email'

/** The link in the verification email points here, on the web origin, and never at the API. */
export function GET(request: Request) {
	return handleVerifyEmail(request)
}
