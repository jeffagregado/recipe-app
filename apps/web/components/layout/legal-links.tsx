import Link from 'next/link'

const LINKS = [
	{ href: '/privacy', label: 'Privacy Policy' },
	{ href: '/terms', label: 'Terms of Service' },
] as const

/** The page footer naming the public legal pages; the sign-in page and the legal pages share it. */
export function LegalLinks() {
	return (
		<footer className="px-4 pb-6 text-sm text-muted-foreground">
			<nav aria-label="Legal">
				<ul className="flex flex-wrap justify-center gap-x-6">
					{LINKS.map(({ href, label }) => (
						<li key={href}>
							<Link href={href} className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline">{label}</Link>
						</li>
					))}
				</ul>
			</nav>
		</footer>
	)
}
