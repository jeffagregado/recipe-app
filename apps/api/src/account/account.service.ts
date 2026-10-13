import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, like, ne } from 'drizzle-orm';
import type { AuthUser, ChangeEmailInput, ChangePasswordInput, ConfirmEmailChangeResponse, UpdateDisplayNameInput } from '@recipe-app/contracts/types';
import { clearEmailChange, EMAIL_CHANGE_LIFETIME_MS, EMAIL_CHANGE_LINKS_PER_EMAIL, emailChangeIdentifier, emailChangeLinkInvalid, emailChangeMessage, emailChangeNoticeMessage, emailChangeNotPending, emailUnchanged, passwordRequired } from '../auth/auth.email-change.js';
import type { EmailChangeLink } from '../auth/auth.email-change.js';
import { AuthError, emailAlreadyExists, invalidCurrentPassword, passwordAlreadySet, passwordRequiredToDisconnect, unauthenticated, unavailable } from '../auth/auth.errors.js';
import { GOOGLE_PROVIDER_ID } from '../auth/auth.google.js';
import { logAuthFailure } from '../auth/auth.logger.js';
import type { RecipeAuth } from '../auth/auth.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import { RESET_IDENTIFIERS, RESET_LINKS_PER_EMAIL } from '../auth/auth.reset.js';
import { AUTH } from '../auth/auth.tokens.js';
import { CREDENTIAL_PROVIDER, hasPassword, ownCredential, readPublicUser } from '../auth/auth.user.js';
import { newVerificationToken } from '../auth/auth.verification.js';
import { PasswordResetService } from '../auth/password-reset.service.js';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { authAccounts, authSessions, authVerifications, users } from '../database/schema.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { MAIL_TRANSPORT } from '../mail/mail.transport.js';
import type { MailTransport } from '../mail/mail.transport.js';

/** Whose session came with an emailed link, when one did. */
export type LinkCaller = { userId: string; sessionId: string };

/** A stored link's token, and what it replaced: the address that was pending before, with its links. */
type StoredEmailChange = { token: string; previous: { pendingEmail: string | null; links: EmailChangeLink[] } };

@Injectable()
export class AccountService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(AUTH) private readonly auth: RecipeAuth,
    private readonly reset: PasswordResetService,
    private readonly limiter: AuthRateLimiter,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
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
   * Replaces the password once the current one is proven, signs every other session of the Account out, retires its
   * reset links and drops a pending email change. The calling session is kept as it is. Better Auth's own change would end that session too and issue a
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
        // Before the links are touched: every writer takes the Account's own row first.
        await clearEmailChange(tx, userId);
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
    if (!allowed) throw passwordRequiredToDisconnect();
  }

  /**
   * Starts moving the Account to a new address once the current password is proven: records the address as pending,
   * mails it a 24-hour link in place of any older one, and tells the current address. The Account's email changes only
   * when that link is confirmed. A change to a different address replaces the pending one.
   */
  async requestEmailChange(userId: string, input: ChangeEmailInput, origin: string): Promise<AuthUser> {
    const { email, hash } = await this.proveEmailChange(userId, input);
    await this.mailEmailChangeLink(userId, input.newEmail, origin, 'change-email', hash);
    // The notice is a courtesy to the current address: a failure is logged and the change still waits on its link.
    try { await this.mail.send(emailChangeNoticeMessage(email, origin, input.newEmail)); } catch (cause) { logAuthFailure('change-email-notice-mail', cause); }
    return this.readOwnUser(userId, 'change-email');
  }

  /**
   * Decides whether the Account may start this change: it has a password, the one given is right, and the address is
   * neither its own nor another Account's. Answers its current email and the hash the password was checked against.
   */
  private async proveEmailChange(userId: string, input: ChangeEmailInput): Promise<{ email: string; hash: string }> {
    try {
      const [stored] = await this.db.select({ email: users.email, password: authAccounts.password })
        .from(users).leftJoin(authAccounts, ownCredential).where(eq(users.id, userId)).limit(1);
      if (!stored) throw unauthenticated();
      if (!stored.password) throw passwordRequired();
      if (input.newEmail === stored.email) throw emailUnchanged();
      const { password } = await this.auth.$context;
      if (!await password.verify({ hash: stored.password, password: input.currentPassword })) throw invalidCurrentPassword();
      // Answered only past the password check, so only the Account's owner learns that an address is registered.
      if (await this.db.$count(users, eq(users.email, input.newEmail)) > 0) throw emailAlreadyExists();
      return { email: stored.email, hash: stored.password };
    } catch (cause) {
      if (cause instanceof AuthError) throw cause;
      throw unavailable('change-email', cause);
    }
  }

  /**
   * Mails a fresh link to the address the Account is already waiting on and retires the older one. The current address
   * was told when the change started and is not told again.
   */
  async resendEmailChange(userId: string, origin: string): Promise<void> {
    let account: { pendingEmail: string | null } | undefined;
    try {
      [account] = await this.db.select({ pendingEmail: users.pendingEmail }).from(users).where(eq(users.id, userId)).limit(1);
    } catch (cause) { throw unavailable('resend-email-change', cause); }
    if (!account) throw unauthenticated();
    if (!account.pendingEmail) throw emailChangeNotPending();
    await this.mailEmailChangeLink(userId, account.pendingEmail, origin, 'resend-email-change');
  }

  /**
   * Counts the link against its target address, three an hour whichever of starting and resending asks, stores it and
   * mails it. Nothing about the address is hidden from its own Account, so a failure is raised; a link that could not be
   * mailed leaves the Account's pending change and links as they were before.
   */
  private async mailEmailChangeLink(userId: string, newEmail: string, origin: string, operation: 'change-email' | 'resend-email-change', provenHash?: string): Promise<void> {
    const { scope, ...limit } = EMAIL_CHANGE_LINKS_PER_EMAIL;
    await this.limiter.consume(rateLimitKey(scope, newEmail), limit);
    let stored: StoredEmailChange;
    try { stored = await this.storeEmailChange(userId, newEmail, provenHash); } catch (cause) {
      if (cause instanceof AuthError) throw cause;
      throw unavailable(operation, cause);
    }
    try { await this.mail.send(emailChangeMessage(newEmail, origin, stored.token)); } catch (cause) {
      try { await this.restoreEmailChange(userId, stored); } catch (undo) { logAuthFailure(`${operation}-undo`, undo); }
      throw unavailable(`${operation}-mail`, cause);
    }
  }

  /** Clears the pending address and retires its links. With nothing pending it answers the same. */
  async cancelEmailChange(userId: string): Promise<AuthUser> {
    try { await this.db.transaction((tx) => clearEmailChange(tx, userId)); } catch (cause) { throw unavailable('cancel-email-change', cause); }
    return this.readOwnUser(userId, 'cancel-email-change');
  }

  /**
   * Consumes the link: the pending address becomes the Account's Verified email, every session of the Account but the
   * caller's own ends, and its reset links, mailed to the old address, are retired. Sign-in methods are untouched: a
   * Google identity is tied to the Google account, not to the email. Creates no session.
   */
  async confirmEmailChange(token: string, caller: LinkCaller | undefined): Promise<ConfirmEmailChangeResponse> {
    let outcome: ConfirmEmailChangeResponse | undefined;
    try {
      outcome = await this.db.transaction(async (tx) => {
        const live = and(eq(authVerifications.identifier, emailChangeIdentifier(token)), gt(authVerifications.expiresAt, new Date()));
        const [found] = await tx.select({ userId: authVerifications.value }).from(authVerifications).where(live).limit(1);
        if (!found) return undefined;
        const { userId } = found;
        // The Account's own row first, then its links: the order every other writer takes them in.
        const [account] = await tx.select({ pendingEmail: users.pendingEmail }).from(users).where(eq(users.id, userId)).for('update');
        // Deleting the row is the single use: of two requests with one token, only one gets it back.
        const [link] = await tx.delete(authVerifications).where(live).returning({ id: authVerifications.id });
        if (!link || !account?.pendingEmail) return undefined;
        await clearEmailChange(tx, userId);
        // Another Account may have taken the address since the change started. The change is dropped, and committed as dropped.
        if (await tx.$count(users, eq(users.email, account.pendingEmail)) > 0) return undefined;
        // The owner of the new inbox opened the link, so the address is Verified the way a sign-up address is.
        await tx.update(users).set({ email: account.pendingEmail, emailVerified: true }).where(eq(users.id, userId));
        const signedIn = caller?.userId === userId;
        await tx.delete(authSessions).where(and(eq(authSessions.userId, userId), caller && signedIn ? ne(authSessions.id, caller.sessionId) : undefined));
        await tx.delete(authVerifications).where(and(eq(authVerifications.value, userId), like(authVerifications.identifier, RESET_IDENTIFIERS)));
        return { signedIn };
      });
    } catch (cause) {
      // Two Accounts confirmed the same address at once: the unique email decided, and this one lost.
      if (isUniqueViolation(cause, 'users_email_key')) throw emailChangeLinkInvalid();
      throw unavailable('confirm-email-change', cause);
    }
    if (!outcome) throw emailChangeLinkInvalid();
    return outcome;
  }

  /**
   * Records the pending address with a new 24-hour link in place of the Account's older ones. A change that starts with a
   * password is refused if that password was replaced since it was checked, so a change cannot slip in behind the
   * password change that is meant to stop it.
   */
  private async storeEmailChange(userId: string, newEmail: string, provenHash?: string): Promise<StoredEmailChange> {
    const token = newVerificationToken();
    const previous = await this.db.transaction(async (tx) => {
      // The row lock makes two requests for one Account take turns, so the pending address and the one live link agree.
      const [account] = await tx.select({ pendingEmail: users.pendingEmail }).from(users).where(eq(users.id, userId)).for('update');
      if (!account) throw unauthenticated();
      const proven = and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, CREDENTIAL_PROVIDER), eq(authAccounts.password, provenHash ?? ''));
      if (provenHash !== undefined && await tx.$count(authAccounts, proven) === 0) throw invalidCurrentPassword();
      const links = await clearEmailChange(tx, userId);
      await tx.update(users).set({ pendingEmail: newEmail }).where(eq(users.id, userId));
      await tx.insert(authVerifications).values({ identifier: emailChangeIdentifier(token), value: userId, expiresAt: new Date(Date.now() + EMAIL_CHANGE_LIFETIME_MS) });
      return { pendingEmail: account.pendingEmail, links };
    });
    return { token, previous };
  }

  /**
   * Takes back a link that could not be mailed and puts back what it replaced. If the link is no longer the Account's
   * live one, something newer decided the pending change (a cancel, a password change, another request) and it stands.
   */
  private async restoreEmailChange(userId: string, { token, previous }: StoredEmailChange): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');
      const [unsent] = await tx.delete(authVerifications).where(eq(authVerifications.identifier, emailChangeIdentifier(token))).returning({ id: authVerifications.id });
      if (!unsent) return;
      await tx.update(users).set({ pendingEmail: previous.pendingEmail }).where(eq(users.id, userId));
      if (previous.links.length > 0) await tx.insert(authVerifications).values(previous.links);
    });
  }

  private async readOwnUser(userId: string, operation: string): Promise<AuthUser> {
    let user: AuthUser | undefined;
    try { user = await readPublicUser(this.db, userId); } catch (cause) { throw unavailable(operation, cause); }
    // The Account was deleted since the guard read it.
    if (!user) throw unauthenticated();
    return user;
  }
}
