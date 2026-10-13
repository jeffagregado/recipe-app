import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, like, or } from 'drizzle-orm';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { authAccounts, authSessions, authVerifications, users } from '../database/schema.js';
import { MAIL_TRANSPORT } from '../mail/mail.transport.js';
import type { MailTransport } from '../mail/mail.transport.js';
import { AuthError, unavailable } from './auth.errors.js';
import type { RecipeAuth } from './auth.js';
import { logAuthFailure } from './auth.logger.js';
import { RESET_IDENTIFIERS, RESET_LIFETIME_MS, resetIdentifier, resetLinkInvalid, resetMessage } from './auth.reset.js';
import { AUTH } from './auth.tokens.js';
import { CREDENTIAL_PROVIDER } from './auth.user.js';
import { newVerificationToken, VERIFICATION_IDENTIFIERS } from './auth.verification.js';

/**
 * The reset link is stored and consumed here, like the verification link, and not through Better Auth's own reset API:
 * that API builds a link to the API's native route, which stays closed, keeps older links alive and consumes a link
 * outside a transaction. Better Auth still hashes the password, so its own sign-in verifies what is stored here.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(AUTH) private readonly auth: RecipeAuth,
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
  ) {}

  /**
   * Mails a one-hour link to a known Account and retires its older ones. The caller answers the same either way, so a
   * failure to store or send is logged and not raised: an error here would say that the address is registered.
   */
  async requestReset(email: string, origin: string): Promise<void> {
    let user: { id: string; email: string } | undefined;
    try {
      user = await this.db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true, email: true } });
    } catch (cause) { throw unavailable('forgot-password', cause); }
    if (!user) return;
    try { await this.sendLink(user, origin); } catch (cause) { logAuthFailure('forgot-password-link', cause); }
  }

  /**
   * Stores a one-hour link for the Account, retiring its older ones, and mails it to the Account's address. A failure to
   * store is raised as it is, for the caller to answer or to hide; a failure to send is logged.
   */
  async sendLink(user: { id: string; email: string }, origin: string): Promise<void> {
    const { id } = user;
    const token = newVerificationToken();
    await this.db.transaction(async (tx) => {
      // The row lock makes two requests for one Account take turns, so only the later link is left.
      await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).for('update');
      await tx.delete(authVerifications).where(and(eq(authVerifications.value, id), like(authVerifications.identifier, RESET_IDENTIFIERS)));
      await tx.insert(authVerifications).values({ identifier: resetIdentifier(token), value: id, expiresAt: new Date(Date.now() + RESET_LIFETIME_MS) });
    });
    // Not awaited: waiting for the mail provider would make the answer for a known address measurably slower.
    void this.mail.send(resetMessage(user.email, origin, token)).catch((cause: unknown) => logAuthFailure('reset-link-mail', cause));
  }

  /**
   * Consumes the link: sets the password, signs every session of the Account out, marks its email verified and retires
   * its other links. Creates no session. An Account that has no password yet gets its first one.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const live = and(eq(authVerifications.identifier, resetIdentifier(token)), gt(authVerifications.expiresAt, new Date()));
    let hash: string;
    try {
      // Read first, so a request with a dead token costs no password hash. Nothing is consumed by this read.
      const [link] = await this.db.select({ id: authVerifications.id }).from(authVerifications).where(live).limit(1);
      if (!link) throw resetLinkInvalid();
      hash = await (await this.auth.$context).password.hash(password);
    } catch (cause) {
      if (cause instanceof AuthError) throw cause;
      throw unavailable('reset-password', cause);
    }
    let reset: boolean;
    try {
      reset = await this.db.transaction(async (tx) => {
        // Deleting the row is the single use: of two requests with one token, only one gets it back.
        const [link] = await tx.delete(authVerifications).where(live).returning({ userId: authVerifications.value });
        if (!link) return false;
        const { userId } = link;
        const accounts = await tx.update(users).set({ emailVerified: true }).where(eq(users.id, userId)).returning({ id: users.id });
        if (accounts.length !== 1) return false;
        const credential = and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, CREDENTIAL_PROVIDER));
        const updated = await tx.update(authAccounts).set({ password: hash }).where(credential).returning({ id: authAccounts.id });
        // Written directly, not through Better Auth: its account hook belongs to sign-up and would add the default categories again.
        if (updated.length === 0) await tx.insert(authAccounts).values({ accountId: userId, providerId: CREDENTIAL_PROVIDER, userId, password: hash });
        await tx.delete(authSessions).where(eq(authSessions.userId, userId));
        await tx.delete(authVerifications).where(and(
          eq(authVerifications.value, userId),
          or(like(authVerifications.identifier, RESET_IDENTIFIERS), like(authVerifications.identifier, VERIFICATION_IDENTIFIERS)),
        ));
        return true;
      });
    } catch (cause) { throw unavailable('reset-password', cause); }
    if (!reset) throw resetLinkInvalid();
  }
}
