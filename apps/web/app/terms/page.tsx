import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage } from '@/components/layout/legal-page'
import { CONTACT_EMAIL } from '@/lib/contact'

export const metadata: Metadata = { title: 'Terms of Service' }

export default function TermsPage() {
	return (
		<LegalPage title="Terms of Service" updated="14 October 2026">
			<section>
				<p>
					Recapp (Recipe App) is a personal project, offered free of charge. By using it you agree to these terms. How your data
					is handled is described in the <Link href="/privacy">Privacy Policy</Link>.
				</p>
			</section>

			<section>
				<h2>Using Recapp</h2>
				<ul>
					<li>Recapp is for personal, non-commercial use.</li>
					<li>Keep your password to yourself; you are responsible for what happens in your account.</li>
					<li>Do not misuse the service, for example by trying to reach other people&apos;s accounts or by overloading it.</li>
				</ul>
			</section>

			<section>
				<h2>Your recipes and photos</h2>
				<p>
					You own the recipes and photos you add. Recapp stores them only to show them back to you. You are responsible for
					having the right to upload what you add.
				</p>
			</section>

			<section>
				<h2>No warranty</h2>
				<p>
					Recapp is provided as it is, without any warranty. Keep your own copy of anything you cannot afford to lose. To the
					extent the law allows, the owner is not liable for any loss arising from its use.
				</p>
			</section>

			<section>
				<h2>Changes</h2>
				<p>
					Recapp may change, or stop, at any time. These terms may change too; the date at the top changes with them, and using
					Recapp after a change means you accept the new terms.
				</p>
			</section>

			<section>
				<h2>Contact</h2>
				<p>Questions go to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
			</section>
		</LegalPage>
	)
}
