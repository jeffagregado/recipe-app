import { cookies } from 'next/headers'
import { readPendingVerification } from '@/features/auth/pending-verification'
import { ResendVerification } from '@/features/auth/resend-verification'

/** Reads the address that sign-up left in a cookie; without one, the resend control asks for it. */
export async function PendingVerification() {
	const email = readPendingVerification(await cookies())
	if (!email) {
		return (
			<div className="space-y-5">
				<p className="text-sm leading-6">Enter your email and we will send you a new verification link.</p>
				<ResendVerification />
			</div>
		)
	}
	return (
		<div className="space-y-5">
			<p className="text-sm leading-6 wrap-break-word">
				We sent a verification link to <strong className="font-semibold">{email}</strong>. It expires in 24 hours.
			</p>
			<ResendVerification email={email} />
		</div>
	)
}
