import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandMark } from './brand-mark'
import { LegalLinks } from './legal-links'

type LegalPageProps = {
	title: string
	/** Shown as "Last updated <date>", for example "14 October 2026". */
	updated: string
	children: ReactNode
}

/** A public, readable document page in the auth card's style: the privacy policy and the terms. */
export function LegalPage({ title, updated, children }: LegalPageProps) {
	return (
		<div className="flex min-h-dvh flex-col bg-background">
			<main className="flex flex-1 justify-center px-4 py-10">
				<article aria-labelledby="legal-title" className="w-full max-w-2xl space-y-8 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8">
					<header className="space-y-3">
						<Link href="/" className="inline-flex min-h-11 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
							<BrandMark />
						</Link>
						<h1 id="legal-title" className="text-3xl font-bold wrap-break-word">{title}</h1>
						<p className="text-sm text-muted-foreground">Last updated {updated}</p>
					</header>
					<div className="space-y-8 text-sm leading-6 wrap-break-word *:space-y-3 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:text-lg [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
						{children}
					</div>
				</article>
			</main>
			<LegalLinks />
		</div>
	)
}
