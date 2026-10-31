import type { Metadata } from 'next'
import { LegalPage } from '@/components/layout/legal-page'
import { ContactEmailLink } from '@/components/layout/contact-email-link'

export const metadata: Metadata = { title: 'Privacy Policy' }

/** The categories of service that handle personal data, matching the deployment and apps/api/src/mail/mail.transport.ts. */
const PROCESSORS = [
	'A hosting provider hosts the web app.',
	'A hosting provider hosts the API.',
	'A database provider hosts the database and the photo storage.',
	'A sign-in provider runs Continue with Google.',
	'Analytics providers measure how the site is used.',
	'An email delivery provider delivers account emails.',
]

export default function PrivacyPage() {
	return (
		<LegalPage title="Privacy Policy" updated="31 October 2026">
			<section>
				<p>
					Recapp is a private recipe collection at recapp.site, run by one person as a personal,
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
					{PROCESSORS.map((processor) => <li key={processor}>{processor}</li>)}
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
				<p>Recapp uses the cookies it needs to sign you in, and Google Analytics cookies to measure how the site is used. There are no advertising cookies.</p>
				<ul>
					<li>A session cookie that keeps you signed in, for up to seven days.</li>
					<li>A sign-in state cookie while Continue with Google runs, for up to five minutes.</li>
					<li>A cookie holding the address you signed up with, so the check-your-email page can show it, for up to one hour.</li>
				</ul>
				<p>
					On the live site, Google Analytics sets cookies that tell one browser from another and keep the state of a visit, so
					Recapp can see which pages are used and how often. They do not hold your name, email address or recipes.
				</p>
				<ul>
					<li><code>_ga</code>, which gives your browser a random ID, for up to two years.</li>
					<li><code>_ga_</code> followed by the site&apos;s measurement ID, which keeps the state of your visit, for up to two years.</li>
				</ul>
				<p>
					Google processes this usage data in line with its <a href="https://policies.google.com/privacy">privacy policy</a>. You can
					block these cookies in your browser or with Google&apos;s <a href="https://tools.google.com/dlpage/gaoptout">opt-out add-on</a>;
					Recapp works the same without them.
				</p>
				<p>
					The live site also uses Vercel Web Analytics to count page views. It sets no third-party cookies. It tells visitors
					apart by a hash made from each request. It discards each visitor session after 24 hours. What it records is not tied
					to you or to your IP address. For each page view it may record:
				</p>
				<ul>
					<li>The time and the page address, with some query details filtered out.</li>
					<li>The page you came from.</li>
					<li>Your country, region and city.</li>
					<li>Your device type, operating system and browser, with their versions.</li>
					<li>The version of Vercel&apos;s analytics script.</li>
				</ul>
				<p>
					Vercel describes this in its <a href="https://vercel.com/docs/analytics/privacy-policy">Web Analytics privacy documentation</a>.
				</p>
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
