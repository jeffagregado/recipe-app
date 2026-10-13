import { Inject, Injectable } from '@nestjs/common';
import { ResilienceService } from '@nestjs/resilience';
import type { ResiliencePolicy } from '@nestjs/resilience';
import { APIError } from 'better-auth/api';
import { and, eq, gt, like, lte } from 'drizzle-orm';
import { authUserSchema } from '@recipe-app/contracts/schemas';
import type { AuthSessionResponse, AuthUser, LoginInput, SignupInput } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { authAccounts, authSessions, authVerifications, users } from '../database/schema.js';
import { MAIL_TRANSPORT } from '../mail/mail.transport.js';
import type { MailTransport } from '../mail/mail.transport.js';
import { AUTH } from './auth.tokens.js';
import type { RecipeAuth } from './auth.js';
import { AuthError, emailAlreadyExists, emailNotVerified, unauthenticated, unavailable, verificationLinkInvalid } from './auth.errors.js';
import { logAuthFailure } from './auth.logger.js';
import { accountExistsMessage } from './auth.notice.js';
import { AuthRateLimiter, rateLimitKey } from './auth.rate-limit.js';
import type { SignInMethod } from './auth.notice.js';
import { newVerificationToken, VERIFICATION_IDENTIFIERS, VERIFICATION_LIFETIME_MS, verificationIdentifier, verificationMessage } from './auth.verification.js';
import { authHeaders } from './auth.request.js';
import type { AuthRequest } from './auth.request.js';

function publicUser(user: { id: string; name: string }): AuthUser {
  return authUserSchema.parse({ id: user.id, displayName: user.name });
}

@Injectable()
export class AuthService {
  private readonly credentialPolicy: ResiliencePolicy;

  constructor(
    @Inject(AUTH) private readonly auth: RecipeAuth,
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    resilience: ResilienceService,
    @Inject(MAIL_TRANSPORT) private readonly mail: MailTransport,
    private readonly limiter: AuthRateLimiter,
  ) {
    this.credentialPolicy = resilience.preset('authCredential');
  }

  /** Creates an unverified Account and mails its link. No session exists until the link is opened and the person logs in. */
  async signup(input: SignupInput, request: AuthRequest, origin: string): Promise<void> {
    let userId: string;
    try {
      const { user } = await this.credentialPolicy.execute(() => this.auth.api.signUpEmail({
        body: { name: input.displayName, email: input.email, password: input.password }, headers: authHeaders(request),
      }));
      userId = user.id;
    } catch (cause) {
      return this.rejectSignup(cause, input.email, origin);
    }
    // With verification required, Better Auth answers a taken email like a new one, under an id that was never stored.
    let created: { id: string } | undefined;
    try {
      created = await this.db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } });
    } catch (cause) { throw unavailable('signup', cause); }
    if (!created) return this.rejectTaken(input.email, origin);
    await this.sendVerification({ id: userId, email: input.email }, origin, 'signup-mail');
  }

  /** Sends a new link only to a known, unverified Account. The caller answers the same either way. */
  async resendVerification(email: string, origin: string): Promise<void> {
    let user: { id: string; email: string; emailVerified: boolean } | undefined;
    try {
      user = await this.db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true, email: true, emailVerified: true } });
    } catch (cause) { throw unavailable('resend-verification', cause); }
    if (user && !user.emailVerified) await this.sendVerification(user, origin, 'resend-verification-mail');
  }

  /** Consumes the link: marks the email verified and retires every other link of that Account. Creates no session. */
  async verifyEmail(token: string): Promise<void> {
    let verified: boolean;
    try {
      verified = await this.db.transaction(async (tx) => {
        // Deleting the row is the single use: of two requests with one token, only one gets it back.
        const [link] = await tx.delete(authVerifications)
          .where(and(eq(authVerifications.identifier, verificationIdentifier(token)), gt(authVerifications.expiresAt, new Date())))
          .returning({ userId: authVerifications.value });
        if (!link) return false;
        const accounts = await tx.update(users).set({ emailVerified: true }).where(eq(users.id, link.userId)).returning({ id: users.id });
        await tx.delete(authVerifications).where(and(eq(authVerifications.value, link.userId), like(authVerifications.identifier, VERIFICATION_IDENTIFIERS)));
        return accounts.length === 1;
      });
    } catch (cause) { throw unavailable('verify-email', cause); }
    if (!verified) throw verificationLinkInvalid();
  }

  async login(input: LoginInput, request: AuthRequest): Promise<{ user: AuthUser; cookie: string }> {
    try {
      const { response, headers } = await this.credentialPolicy.execute(() => this.auth.api.signInEmail({
        body: { email: input.email, password: input.password }, headers: authHeaders(request), returnHeaders: true,
      }));
      return { user: publicUser(response.user), cookie: await this.sessionCookie(headers) };
    } catch (cause) {
      // Better Auth checks the password first, so this code is only ever given to someone who knows it.
      if (cause instanceof APIError && cause.body?.code === 'EMAIL_NOT_VERIFIED') throw emailNotVerified(cause);
      if (cause instanceof APIError && cause.statusCode >= 400 && cause.statusCode < 500) {
        throw new AuthError(401, 'INVALID_CREDENTIALS', 'Invalid email or password', { cause });
      }
      throw unavailable('login', cause);
    }
  }

  async session(request: AuthRequest, operation = 'session'): Promise<AuthSessionResponse> {
    const session = await this.readSession(request, operation);
    if (!session) throw unauthenticated();
    try { return { user: publicUser(session.user), expiresAt: session.session.expiresAt.toISOString() }; }
    catch (cause) { throw unavailable(operation, cause); }
  }

  async logout(request: AuthRequest): Promise<string> {
    const session = await this.readSession(request, 'logout-read');
    try {
      const { headers } = await this.auth.api.signOut({ headers: authHeaders(request, true), returnHeaders: true });
      // Better Auth swallows deletion errors. Never expire the browser cookie until revocation is confirmed.
      if (session) {
        const token = session.session.token;
        if (!token) throw new Error('Session token missing.');
        const remaining = await this.db.query.authSessions.findFirst({ where: eq(authSessions.token, token), columns: { id: true } });
        if (remaining) throw new Error('Session revocation was not persisted.');
      }
      return await this.sessionCookie(headers);
    } catch (cause) { throw unavailable('logout-confirm', cause); }
  }

  private async readSession(request: AuthRequest, operation: string) {
    try { return await this.auth.api.getSession({ headers: authHeaders(request, true) }); }
    catch (cause) { throw unavailable(operation, cause); }
  }

  /**
   * Stores a 24-hour link for the Account and mails it. A failure is logged and not raised: the Account already exists,
   * the person can ask again, and an error here would tell a caller of resend that the address is registered.
   */
  private async sendVerification(user: { id: string; email: string }, origin: string, operation: string): Promise<void> {
    const token = newVerificationToken();
    const now = Date.now();
    try {
      await this.db.delete(authVerifications).where(and(
        eq(authVerifications.value, user.id), like(authVerifications.identifier, VERIFICATION_IDENTIFIERS), lte(authVerifications.expiresAt, new Date(now)),
      ));
      await this.db.insert(authVerifications).values({ identifier: verificationIdentifier(token), value: user.id, expiresAt: new Date(now + VERIFICATION_LIFETIME_MS) });
      await this.mail.send(verificationMessage(user.email, origin, token));
    } catch (cause) { logAuthFailure(operation, cause); }
  }

  private async rejectSignup(cause: unknown, email: string, origin: string): Promise<never> {
    if (!(cause instanceof APIError)) throw unavailable('signup', cause);
    const code = cause.body?.code;
    if (code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') return this.rejectTaken(email, origin);
    if (code === 'FAILED_TO_CREATE_USER') return this.rejectCreation(cause, email, origin);
    if (cause.statusCode < 500 && code && /PASSWORD|EMAIL/.test(code)) {
      throw new AuthError(400, 'VALIDATION_FAILED', 'Invalid signup details.', { cause });
    }
    throw unavailable('signup', cause);
  }

  private async rejectCreation(cause: unknown, email: string, origin: string): Promise<never> {
    let conflict: { id: string } | undefined;
    try {
      conflict = await this.db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
    } catch (confirmationCause) { throw unavailable('signup', confirmationCause); }
    if (conflict) return this.rejectTaken(email, origin);
    throw unavailable('signup', cause);
  }

  /**
   * Answers the conflict after telling the Account's own address about the attempt, at most 3 times an hour so sign-up
   * cannot flood an inbox. A failure is logged and not raised: the answer is the same whether or not the notice went out.
   */
  private async rejectTaken(email: string, origin: string): Promise<never> {
    try {
      if (await this.limiter.allows(rateLimitKey('notice:email', email), { limit: 3, windowMs: 3_600_000 })) {
        const accounts = await this.db.select({ providerId: authAccounts.providerId }).from(authAccounts)
          .innerJoin(users, eq(users.id, authAccounts.userId)).where(eq(users.email, email));
        const methods: SignInMethod[] = accounts.some(({ providerId }) => providerId === 'credential') ? ['password'] : [];
        await this.mail.send(accountExistsMessage(email, origin, methods));
      }
    } catch (cause) { logAuthFailure('signup-notice-mail', cause); }
    throw emailAlreadyExists();
  }

  private async sessionCookie(headers: Headers): Promise<string> {
    const name = (await this.auth.$context).authCookies.sessionToken.name;
    const cookies = headers.getSetCookie().filter((value) => value.startsWith(`${name}=`));
    if (cookies.length !== 1) throw new Error('Expected exactly one session cookie.');
    return cookies[0];
  }
}
