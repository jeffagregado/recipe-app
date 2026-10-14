'use client'

import type { GoogleSignIn } from '@recipe-app/contracts/types'
import { Loader2 } from 'lucide-react'
import { useId, useState } from 'react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { GoogleMark } from '@/features/auth/google-mark'
import { useAppToast } from '@/lib/use-app-toast'
import { connectGoogle } from '../actions/connect-google'
import { disconnectGoogle } from '../actions/disconnect-google'
import { SIGN_IN_METHODS_MESSAGES, type ConnectGoogleResult, type DisconnectGoogleResult } from '../actions/results'
import { useSingleFlight } from '@/lib/use-single-flight'

type SignInMethodsCardProps = {
	/** Both from the session read: a disconnect or a connect refreshes it, and the card renders what it then reports. */
	hasPassword: boolean
	google: GoogleSignIn | null
	onConnect?: () => Promise<ConnectGoogleResult>
	onDisconnect?: () => Promise<DisconnectGoogleResult>
}

const rowClass = 'flex min-h-11 items-center justify-between gap-3 py-2'

/** What the one Google button says and is called, by what it would do and whether it is doing it. */
const GOOGLE_BUTTON = {
	connect: { idle: ['Connect', 'Connect Google'], busy: ['Connecting…', 'Connecting Google'] },
	disconnect: { idle: ['Disconnect', 'Disconnect Google'], busy: ['Disconnecting…', 'Disconnecting Google'] },
} as const

/** The Sign-in methods card: whether a password is set, and Google connected with its address or offered to connect. */
export function SignInMethodsCard({ hasPassword, google, onConnect = connectGoogle, onDisconnect = disconnectGoogle }: SignInMethodsCardProps) {
	const toast = useAppToast()
	const headingId = useId()
	const reasonId = useId()
	const [confirming, setConfirming] = useState(false)
	const [alert, setAlert] = useState<string>()
	// The last Sign-in method stays: without a password Google cannot go.
	const locked = google !== null && !hasPassword
	// A connect that starts redirects to Google, so only a start that failed settles here.
	const { pending, run } = useSingleFlight(
		(does: keyof typeof GOOGLE_BUTTON): Promise<ConnectGoogleResult | DisconnectGoogleResult> => (does === 'connect' ? onConnect() : onDisconnect()),
		(does): ConnectGoogleResult | DisconnectGoogleResult => ({ status: 'failed', message: does === 'connect' ? SIGN_IN_METHODS_MESSAGES.connectFailed : SIGN_IN_METHODS_MESSAGES.disconnectFailed }),
		(result) => {
			if (result.status === 'disconnected') {
				toast.success(SIGN_IN_METHODS_MESSAGES.disconnected)
				return
			}
			toast.error(result.message)
			setAlert(result.message)
		},
	)

	function start(does: keyof typeof GOOGLE_BUTTON) {
		setConfirming(false)
		setAlert(undefined)
		run(does)
	}

	return (
		<section aria-labelledby={headingId} className="max-w-xl">
			<Card className="sm:[--card-spacing:--spacing(5)]">
				<div className="px-(--card-spacing)">
					<h2 id={headingId} className="text-base font-semibold">Sign-in methods</h2>
					<p className="text-sm text-muted-foreground">You always keep at least one way in.</p>
				</div>
				<CardContent aria-busy={pending} className="space-y-2">
					<ul className="divide-y text-sm">
						<li className={rowClass}>
							<span className="font-medium">Password</span>
							<Badge variant={hasPassword ? 'secondary' : 'outline'} className="h-6 shrink-0">{hasPassword ? 'Set' : 'Not set'}</Badge>
						</li>
						<li className={rowClass}>
							<GoogleLabel google={google} />
							<GoogleButton
								does={google ? 'disconnect' : 'connect'}
								pending={pending}
								// Disabled rather than hidden without a password, with the reason beside it.
								reasonId={locked ? reasonId : undefined}
								onClick={google ? () => setConfirming(true) : () => start('connect')}
							/>
						</li>
					</ul>
					{locked && <p id={reasonId} className="text-sm text-muted-foreground">{SIGN_IN_METHODS_MESSAGES.passwordRequired}</p>}
					{alert && <p role="alert" className="text-sm font-medium text-destructive wrap-break-word">{alert}</p>}
				</CardContent>
			</Card>
			{/* Escape and the backdrop keep Google. */}
			<AlertDialog open={confirming} onOpenChange={(next) => { if (!next) setConfirming(false) }}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Disconnect Google?</AlertDialogTitle>
						<AlertDialogDescription>You’ll sign in with your email and password from now on.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep</AlertDialogCancel>
						<AlertDialogAction variant="destructive" onClick={() => start('disconnect')}>Disconnect</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	)
}

/** Google by name, with its mark and address once an identity is attached. One attached before addresses were kept has none. */
function GoogleLabel({ google }: { google: GoogleSignIn | null }) {
	return (
		<span className="flex min-w-0 items-center gap-2 font-medium">
			{google && <GoogleMark />}
			<span className="min-w-0 wrap-break-word">
				Google{google?.email && <span className="font-normal text-muted-foreground"> · {google.email}</span>}
			</span>
		</span>
	)
}

type GoogleButtonProps = {
	does: keyof typeof GOOGLE_BUTTON
	pending: boolean
	/** Names why the button cannot be used; with it the button is disabled. */
	reasonId?: string
	onClick: () => void
}

/** One button in one place for both states, so focus stays on it when a disconnect turns it into Connect. */
function GoogleButton({ does, pending, reasonId, onClick }: GoogleButtonProps) {
	const [text, name] = GOOGLE_BUTTON[does][pending ? 'busy' : 'idle']
	return (
		<Button type="button" variant="outline" className="h-11 shrink-0 gap-2 px-4" aria-label={name} disabled={pending || reasonId !== undefined} aria-describedby={reasonId} onClick={onClick}>
			{pending && <Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" />}
			{!pending && does === 'connect' && <GoogleMark />}
			{text}
		</Button>
	)
}
