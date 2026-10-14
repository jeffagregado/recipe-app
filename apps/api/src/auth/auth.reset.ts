import type { MailMessage } from '../mail/mail.transport.js';
import { AuthError } from './auth.errors.js';
import { hashLinkToken } from './auth.verification.js';

export const RESET_LIFETIME_MS = 60 * 60 * 1000;
/** Per target address, shared by every way of asking for a reset link, so together they mail it at most three an hour. */
export const RESET_LINKS_PER_EMAIL = { scope: 'forgot:email', limit: 3, windowMs: 60 * 60 * 1000 } as const;

const IDENTIFIER_PREFIX = 'password-reset:';

/** The verifications row of one reset link: the identifier carries the token's hash and the value names the Account. */
export const resetIdentifier = (token: string) => `${IDENTIFIER_PREFIX}${hashLinkToken(token)}`;
export const RESET_IDENTIFIERS = `${IDENTIFIER_PREFIX}%`;

/** One answer for an expired, used and unknown token, so the response never says which. */
export const resetLinkInvalid = () => new AuthError(400, 'RESET_LINK_INVALID', 'This reset link has expired or was already used.');

/** The link opens the web app's reset page, which posts the token with the new password. `origin` is a trusted origin, never caller text. */
export function resetMessage(to: string, origin: string, token: string): MailMessage {
  return {
    kind: 'password-reset',
    to,
    subject: 'Reset your password',
    html: [
      '<p>We received a request to reset the password of your Recipe App account.</p>',
      `<p><a href="${origin}/reset-password?token=${token}">Choose a new password</a></p>`,
      '<p>The link works once and expires in one hour. If you did not ask for it, you can ignore this email and your password stays the same.</p>',
    ].join(''),
  };
}
