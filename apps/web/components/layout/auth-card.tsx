import { Utensils } from 'lucide-react'
import type { ReactNode } from 'react'

type AuthCardProps = {
	titleId: string
	title: string
	description: string
	children: ReactNode
}

/** The centred card that the login page and the email verification pages share; `title` is the page's only `h1`. */
export function AuthCard({ titleId, title, description, children }: AuthCardProps) {
	return (
		<main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
			<section aria-labelledby={titleId} className="w-full max-w-md space-y-7 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
				<header className="space-y-3">
					<div className="flex size-11 items-center justify-center rounded-full bg-[#526619] text-white"><Utensils aria-hidden="true" size={22} /></div>
					<h1 id={titleId} className="text-3xl font-bold wrap-break-word">{title}</h1>
					<p className="text-sm leading-6 text-muted-foreground">{description}</p>
				</header>
				{children}
			</section>
		</main>
	)
}
