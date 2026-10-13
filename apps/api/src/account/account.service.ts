import { Inject, Injectable } from '@nestjs/common';
import { and, eq, like, ne } from 'drizzle-orm';
import type { AuthUser, ChangePasswordInput, UpdateDisplayNameInput } from '@recipe-app/contracts/types';
import { AuthError, invalidCurrentPassword, passwordAlreadySet, passwordRequired, unauthenticated, unavailable } from '../auth/auth.errors.js';
import { GOOGLE_PROVIDER_ID } from '../auth/auth.google.js';
import type { RecipeAuth } from '../auth/auth.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import { RESET_IDENTIFIERS, RESET_LINKS_PER_EMAIL } from '../auth/auth.reset.js';
import { AUTH } from '../auth/auth.tokens.js';
import { CREDENTIAL_PROVIDER, hasPassword, ownCredential, readPublicUser } from '../auth/auth.user.js';
import { PasswordResetService } from '../auth/password-reset.service.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { authAccounts, authSessions, authVerifications, users } from '../database/schema.js';

@Injectable()
export class AccountService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(AUTH) private readonly auth: RecipeAuth,
    private readonly reset: PasswordResetService,
    private readonly limiter: AuthRateLimiter,
  ) {}

  /**
   * Renames the Account the session guard already identified, then reads its public user back. Better Auth's own update
   * would look the session up a second time, and with no cookie cache it has nothing else to refresh. The session is unchanged.
   */
  async updateDisplayName(userId: string, input: UpdateDisplayNameInput): Promise<AuthUser> {
    let user: AuthUser | undefined;
    try {
      await this.db.update(users).set({ name: input.displayName }).where(eq(users.id, userId));
      user = await readPublicUser(this.db, userId);
    } catch (cause) { throw unavailable('update-display-name', cause); }
    // The Account was deleted between the guard's read and this write.
    if (!user) throw unauthenticated();
    return user;
  }

  /**
   * Replaces the password once the current one is proven, signs every other session of the Account out and retires its
   * reset links. The calling session is kept as it is. Better Auth's own change would end that session too and issue a
   * new cookie, which a wrapper called by a server action cannot hand to the browser; it still hashes and verifies here.
   */
  async changePassword(userId: string, sessionId: string, input: ChangePasswordInput): Promise<void> {
    const credential = and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, CREDENTIAL_PROVIDER));
    let current: string;
    let hash: string;
    try {
      const { password } = await this.auth.$context;
      const [stored] = await this.db.select({ password: authAccounts.password }).from(authAccounts).where(credential).limit(1);
      // An Account without a password has no current one to get right.
      if (!stored?.password || !await password.verify({ hash: stored.password, password: input.currentPassword })) throw invalidCurrentPassword();
      current = stored.password;
      hash = await password.hash(input.newPassword);
    } catch (cause) {
      if (cause instanceof AuthError) throw cause;
      throw unavailable('change-password', cause);
    }
    let changed: boolean;
    try {
      changed = await this.db.transaction(async (tx) => {
        // Only the password that was verified is replaced: of two changes at once, the second no longer knows the current one.
        const updated = await tx.update(authAccounts).set({ password: hash }).where(and(credential, eq(authAccounts.password, current))).returning({ id: authAccounts.id });
        if (updated.length === 0) return false;
        await tx.delete(authSessions).where(and(eq(authSessions.userId, userId), ne(authSessions.id, sessionId)));
        await tx.delete(authVerifications).where(and(eq(authVerifications.value, userId), like(authVerifications.identifier, RESET_IDENTIFIERS)));
        return true;
      });
    } catch (cause) { throw unavailable('change-password', cause); }
    if (!changed) throw invalidCurrentPassword();
  }

  /**
   * Mails the reset flow's link to the Account's own address, so a person who signed up with Google can create a
   * password. Nothing about the Account changes until the link is used. An Account that has a password is refused: it
   * changes its password with the current one, or resets it from the login page.
   */
  async requestSetPassword(userId: string, origin: string): Promise<void> {
    let account: { id: string; email: string; hasPassword: boolean } | undefined;
    try {
      [account] = await this.db.select({ id: users.id, email: users.email, hasPassword })
        .from(users).leftJoin(authAccounts, ownCredential).where(eq(users.id, userId)).limit(1);
    } catch (cause) { throw unavailable('request-set-password', cause); }
    if (!account) throw unauthenticated();
    if (account.hasPassword) throw passwordAlreadySet();
    const { scope, ...limit } = RESET_LINKS_PER_EMAIL;
    await this.limiter.consume(rateLimitKey(scope, account.email), limit);
    try { await this.reset.sendLink(account, origin); } catch (cause) { throw unavailable('request-set-password', cause); }
  }

  /**
   * Removes the Account's Google identity while a password remains, and keeps every session. The password record is
   * locked for the length of the check and the delete, so nothing can take the password away between the two and leave
   * the Account without a Sign-in method. An Account with no Google identity is already where this ends.
   */
  async disconnectGoogle(userId: string): Promise<void> {
    let allowed: boolean;
    try {
      allowed = await this.db.transaction(async (tx) => {
        const [credential] = await tx.select({ hasPassword }).from(authAccounts)
          .where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, CREDENTIAL_PROVIDER))).limit(1).for('update');
        if (!credential?.hasPassword) return false;
        await tx.delete(authAccounts).where(and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, GOOGLE_PROVIDER_ID)));
        return true;
      });
    } catch (cause) { throw unavailable('disconnect-google', cause); }
    if (!allowed) throw passwordRequired();
  }
}
