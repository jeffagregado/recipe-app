import { Inject, Injectable } from '@nestjs/common';
import { ResilienceService } from '@nestjs/resilience';
import type { ResiliencePolicy } from '@nestjs/resilience';
import { APIError } from 'better-auth/api';
import { eq, or } from 'drizzle-orm';
import { authUserSchema } from '@recipe-app/contracts/schemas';
import type { AuthSessionResponse, AuthUser, LoginInput, SignupInput } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { authSessions, users } from '../database/schema.js';
import { AUTH } from './auth.tokens.js';
import type { RecipeAuth } from './auth.js';
import { AuthError, unauthenticated, unavailable, usernameUnavailable } from './auth.errors.js';
import { authHeaders } from './auth.request.js';
import type { AuthRequest } from './auth.request.js';

function publicUser(user: { id: string; name: string; username?: string | null }): AuthUser {
  return authUserSchema.parse({ id: user.id, displayName: user.name, username: user.username });
}

@Injectable()
export class AuthService {
  private readonly credentialPolicy: ResiliencePolicy;

  constructor(@Inject(AUTH) private readonly auth: RecipeAuth, @Inject(DRIZZLE_DB) private readonly db: DrizzleDb, resilience: ResilienceService) {
    this.credentialPolicy = resilience.preset('authCredential');
  }

  async signup(input: SignupInput, request: AuthRequest): Promise<{ user: AuthUser; cookie: string }> {
    const email = `${input.username}@accounts.invalid`;
    try {
      const { response, headers } = await this.credentialPolicy.execute(() => this.auth.api.signUpEmail({
        body: { name: input.displayName, username: input.username, password: input.password, email },
        headers: authHeaders(request), returnHeaders: true,
      }));
      return { user: publicUser(response.user), cookie: await this.sessionCookie(headers) };
    } catch (cause) {
      return this.rejectSignup(cause, input.username, email);
    }
  }

  async login(input: LoginInput, request: AuthRequest): Promise<{ user: AuthUser; cookie: string }> {
    try {
      const { response, headers } = await this.credentialPolicy.execute(() => this.auth.api.signInUsername({
        body: { username: input.username, password: input.password }, headers: authHeaders(request), returnHeaders: true,
      }));
      return { user: publicUser(response.user), cookie: await this.sessionCookie(headers) };
    } catch (cause) {
      if (cause instanceof APIError && cause.statusCode >= 400 && cause.statusCode < 500) {
        throw new AuthError(401, 'INVALID_CREDENTIALS', 'Invalid username or password', { cause });
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

  private async rejectSignup(cause: unknown, username: string, email: string): Promise<never> {
    if (!(cause instanceof APIError)) throw unavailable('signup', cause);
    const code = cause.body?.code;
    if (code === 'USERNAME_IS_ALREADY_TAKEN' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') throw usernameUnavailable();
    if (code === 'FAILED_TO_CREATE_USER') return this.rejectCreation(cause, username, email);
    if (cause.statusCode < 500 && code && /USERNAME|PASSWORD|EMAIL/.test(code)) {
      throw new AuthError(400, 'VALIDATION_FAILED', 'Invalid signup details.', { cause });
    }
    throw unavailable('signup', cause);
  }

  private async rejectCreation(cause: unknown, username: string, email: string): Promise<never> {
    let conflict: { id: string } | undefined;
    try {
      conflict = await this.db.query.users.findFirst({ where: or(eq(users.username, username), eq(users.email, email)), columns: { id: true } });
    } catch (confirmationCause) { throw unavailable('signup', confirmationCause); }
    if (conflict) throw usernameUnavailable();
    throw unavailable('signup', cause);
  }

  private async sessionCookie(headers: Headers): Promise<string> {
    const name = (await this.auth.$context).authCookies.sessionToken.name;
    const cookies = headers.getSetCookie().filter((value) => value.startsWith(`${name}=`));
    if (cookies.length !== 1) throw new Error('Expected exactly one session cookie.');
    return cookies[0];
  }
}
