import { CONTACT_EMAIL } from '@/lib/contact'

/** A mailto link to the owner's address, as named on the privacy and terms pages. */
export function ContactEmailLink() {
	return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
}
