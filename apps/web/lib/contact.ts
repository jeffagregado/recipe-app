/**
 * The owner's address shown on the privacy and terms pages. Set CONTACT_EMAIL in the deployment; the fallback is a
 * placeholder that reaches nobody and must be replaced before the Google consent screen is published.
 */
export const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'contact-placeholder@example.com'
