import { createHash, randomBytes } from 'node:crypto';
import type { MailMessage } from '../mail/mail.transport.js';

export const VERIFICATION_LIFETIME_MS = 24 * 60 * 60 * 1000;

const IDENTIFIER_PREFIX = 'email-verification:';

/**
 * What an emailed link stores in place of its token: anyone who can read the table, a backup or a branch must not be able
 * to rebuild a working link. A fast hash is enough, because the token carries 256 random bits.
 */
export const hashLinkToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** The verifications row of one link: the identifier carries the token's hash and the value names the Account. */
export const verificationIdentifier = (token: string) => `${IDENTIFIER_PREFIX}${hashLinkToken(token)}`;
export const VERIFICATION_IDENTIFIERS = `${IDENTIFIER_PREFIX}%`;

/** 256 random bits in URL-safe characters, so the link needs no encoding. */
export const newVerificationToken = () => randomBytes(32).toString('base64url');

/** The link opens the web app, which hands the token to the API. `origin` is a trusted origin, never caller text. */
export function verificationMessage(to: string, origin: string, token: string): MailMessage {
  return {
    kind: 'verification',
    to,
    subject: 'Verify your email',
    html: [
      '<p>Welcome to Recapp. Verify your email to finish signing up.</p>',
      `<p><a href="${origin}/verify-email?token=${token}">Verify my email</a></p>`,
      '<p>The link works once and expires in 24 hours. If you did not sign up, you can ignore this email.</p>',
    ].join(''),
  };
}
