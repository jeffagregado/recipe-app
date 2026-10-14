import type { Metadata } from 'next'
import { LegalPage } from '@/components/layout/legal-page'
import { ContactEmailLink } from '@/components/layout/contact-email-link'

export const metadata: Metadata = { title: 'Privacy Policy' }

/** The services that handle personal data, matching the deployment and apps/api/src/mail/mail.transport.ts. */
const PROCESSORS = [
	['Vercel', 'hosts the web app'],
	['Render', 'hosts the API'],
	['Neon', 'hosts the database and the photo storage'],
	['Google', 'provides Sign in with Google'],
	['Resend', 'delivers account emails'],
] as const

export default function PrivacyPage() {
	return (
		<LegalPage title="Privacy Policy" updated="14 October 2026">
			<section>
				<p>
					Recapp (Recipe App) is a private recipe collection at recapp-recipe-app.vercel.app, run by one person as a personal,
					non-commercial project. This page says what Recapp stores about you, why, and who handles it.
				</p>
			</section>

			<section>
				<h2>What Recapp stores</h2>
				<ul>
					<li>Your account: email address, display name, and whether the address is verified. While an email change waits for confirmation, the new address too.</li>
					<li>Your password, as a one-way hash only. The password itself is never stored.</li>
					<li>
						If you use Continue with Google: your Google account ID and the email address Google reports for it. When you sign up
						with Google, your Google name sets your first display name, which you can change. Google&apos;s access tokens are
						discarded after sign-in, and your Google profile photo is not stored.
					</li>
					<li>Your recipes, categories and favorites, including ingredients, steps, notes and video links.</li>
					<li>Photos you upload. Recapp keeps a resized, re-encoded copy; the original file and its metadata, such as camera location, are not kept.</li>
					<li>For each sign-in: a session record with its expiry, your IP address and your browser&apos;s user agent. A session ends after seven days or when you log out.</li>
					<li>Email links for verification, password reset and email change, stored only as a hash and valid for a limited time.</li>
					<li>Short-lived attempt counters for rate limiting, keyed by your client IP address or email address, in most cases hashed. Expired counters are removed as new attempts arrive.</li>
				</ul>
				<p>
					Recapp&apos;s own logs record error types, codes and at most an internal account ID, never your email address, password or recipe content. The hosting
					providers below keep their own request logs, which include IP addresses.
				</p>
			</section>

			<section>
				<h2>Why</h2>
				<ul>
					<li>To run your account and keep your recipes.</li>
					<li>To sign you in, with a password or with Google.</li>
					<li>To send account emails: address verification, password reset, email change, and notices about your account.</li>
					<li>To protect the service from abuse, such as repeated sign-in attempts.</li>
				</ul>
				<p>Recapp shows no ads, sells no data and shares nothing between accounts.</p>
			</section>

			<section>
				<h2>Who handles your data</h2>
				<ul>
					{PROCESSORS.map(([name, role]) => <li key={name}>{name} {role}.</li>)}
				</ul>
			</section>

			<section>
				<h2>Google user data</h2>
				<p>
					Continue with Google asks only for your basic profile: your Google account ID, email address and name. Recapp uses
					it only to sign you in or to link Google to your account. It does not ask for access to Gmail, Drive or any other
					Google data. No Google user data is sold, shared or used for advertising.
				</p>
				<p>
					Recapp&apos;s use and transfer to any other app of information received from Google APIs will adhere to
					the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>,
					including the Limited Use requirements.
				</p>
			</section>

			<section>
				<h2>Cookies</h2>
				<p>Recapp uses only the cookies it needs to sign you in. There are no tracking, advertising or analytics cookies.</p>
				<ul>
					<li>A session cookie that keeps you signed in, for up to seven days.</li>
					<li>A sign-in state cookie while Continue with Google runs, for up to five minutes.</li>
					<li>A cookie holding the address you signed up with, so the check-your-email page can show it, for up to one hour.</li>
				</ul>
			</section>

			<section>
				<h2>Keeping and deleting your data</h2>
				<p>
					Your data is kept while your account exists. To delete your account and everything in it, or to ask what Recapp holds
					about you, email <ContactEmailLink /> from your account&apos;s address.
				</p>
			</section>

			<section>
				<h2>Changes and contact</h2>
				<p>
					If this policy changes, the date at the top changes with it. Questions go
					to <ContactEmailLink />.
				</p>
			</section>
		</LegalPage>
	)
}
