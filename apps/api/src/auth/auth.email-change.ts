import { and, eq, like } from 'drizzle-orm';
import type { DrizzleDb } from '../database/database.service.js';
import { authVerifications, users } from '../database/schema.js';
import type { MailMessage } from '../mail/mail.transport.js';
import { AuthError } from './auth.errors.js';

export const EMAIL_CHANGE_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** Per target address, shared by starting a change and resending its link, so together they mail it at most three an hour. */
export const EMAIL_CHANGE_LINKS_PER_EMAIL = { scope: 'email-change:email', limit: 3, windowMs: 60 * 60 * 1000 } as const;

const IDENTIFIER_PREFIX = 'email-change:';

/** The verifications row of one email-change link: the identifier carries the token and the value names the Account. The new address is the Account's pending email. */
export const emailChangeIdentifier = (token: string) => `${IDENTIFIER_PREFIX}${token}`;
export const EMAIL_CHANGE_IDENTIFIERS = `${IDENTIFIER_PREFIX}%`;
export const tokenOfEmailChangeIdentifier = (identifier: string) => identifier.slice(IDENTIFIER_PREFIX.length);

/** A stored link as it is needed to store it again. */
export type EmailChangeLink = { identifier: string; value: string; expiresAt: Date };

/**
 * Drops an Account's pending change and retires its links, inside the caller's transaction, and returns those links. Changing or resetting the
 * password runs it too: that is what the notice tells the owner of the old address to do about a change they did not ask for.
 */
export async function clearEmailChange(tx: Pick<DrizzleDb, 'update' | 'delete'>, userId: string): Promise<EmailChangeLink[]> {
  await tx.update(users).set({ pendingEmail: null }).where(eq(users.id, userId));
  return tx.delete(authVerifications).where(and(eq(authVerifications.value, userId), like(authVerifications.identifier, EMAIL_CHANGE_IDENTIFIERS)))
    .returning({ identifier: authVerifications.identifier, value: authVerifications.value, expiresAt: authVerifications.expiresAt });
}

/** One answer for an expired, used and unknown token, and for an address another Account took in the meantime. */
export const emailChangeLinkInvalid = () => new AuthError(400, 'EMAIL_CHANGE_LINK_INVALID', 'This link has expired or was already used.');
export const emailChangeNotPending = () => new AuthError(409, 'EMAIL_CHANGE_NOT_PENDING', 'No email change is waiting to be confirmed.');
/** An Account without a password proves nothing by one: it sets a password first. */
export const passwordRequired = () => new AuthError(409, 'PASSWORD_REQUIRED', 'Set a password before changing your email.');
/** Named on the field so the form can show it there. */
export const emailUnchanged = () => new AuthError(400, 'VALIDATION_FAILED', 'Check the submitted fields.', { fieldErrors: { newEmail: ['This is already your email.'] } });

/** The first character of the local part and the whole domain: enough for the owner to recognise their own request. */
export function maskEmail(email: string): string {
  return `${email.slice(0, 1)}***${email.slice(email.lastIndexOf('@'))}`;
}

/**
 * The link opens the web app's confirm page, which posts the token only when its button is pressed. `origin` is a trusted
 * origin, never caller text.
 */
export function emailChangeMessage(to: string, origin: string, token: string): MailMessage {
  return {
    kind: 'email-change',
    to,
    subject: 'Confirm your new email',
    html: [
      '<p>A Recipe App account asked to use this address as its email.</p>',
      `<p><a href="${origin}/confirm-email-change?token=${token}">Confirm my new email</a></p>`,
      '<p>The link works once and expires in 24 hours. The account keeps its current email until you confirm. If you did not ask for this, do not confirm: ignore this email and nothing changes.</p>',
    ].join(''),
  };
}

/**
 * Tells the current address that a change was asked for. It carries no link to the change and only a masked form of the
 * new address, which the shared email rule keeps free of markup characters. `origin` is a trusted origin, never caller text.
 */
export function emailChangeNoticeMessage(to: string, origin: string, newEmail: string): MailMessage {
  return {
    kind: 'email-change-notice',
    to,
    subject: 'A change of your email was requested',
    html: [
      `<p>Someone asked to change the email of your Recipe App account to ${maskEmail(newEmail)}. Your email stays the same until the new address confirms it.</p>`,
      '<p>If it was you, no action is needed here: open the link we sent to the new address.</p>',
      `<p>If it was not you, change your password. That cancels the request and signs out your other devices: <a href="${origin}/settings">Open Settings</a></p>`,
    ].join(''),
  };
}
