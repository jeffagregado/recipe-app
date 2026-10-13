import { Inject, Injectable } from '@nestjs/common';
import { ResilienceService } from '@nestjs/resilience';
import type { ResiliencePolicy } from '@nestjs/resilience';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import { authUserSchema } from '@recipe-app/contracts/schemas';
import type { AuthSessionResponse, AuthUser, LoginInput, SignupInput } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { authSessions, users } from '../database/schema.js';
import { AUTH } from './auth.tokens.js';
import type { RecipeAuth } from './auth.js';
import { AuthError, emailAlreadyExists, unauthenticated, unavailable } from './auth.errors.js';
import { authHeaders } from './auth.request.js';
import type { AuthRequest } from './auth.request.js';

function publicUser(user: { id: string; name: string }): AuthUser {
  return authUserSchema.parse({ id: user.id, displayName: user.name });
}

@Injectable()
export class AuthService {
  private readonly credentialPolicy: ResiliencePolicy;

  constructor(@Inject(AUTH) private readonly auth: RecipeAuth, @Inject(DRIZZLE_DB) private readonly db: DrizzleDb, resilience: ResilienceService) {
    this.credentialPolicy = resilience.preset('authCredential');
  }

  async signup(input: SignupInput, request: AuthRequest): Promise<{ user: AuthUser; cookie: string }> {
    try {
      const { response, headers } = await this.credentialPolicy.execute(() => this.auth.api.signUpEmail({
        body: { name: input.displayName, email: input.email, password: input.password },
        headers: authHeaders(request), returnHeaders: true,
      }));
      return { user: publicUser(response.user), cookie: await this.sessionCookie(headers) };
    } catch (cause) {
      return this.rejectSignup(cause, input.email);
    }
  }

  async login(input: LoginInput, request: AuthRequest): Promise<{ user: AuthUser; cookie: string }> {
    try {
      const { response, headers } = await this.credentialPolicy.execute(() => this.auth.api.signInEmail({
        body: { email: input.email, password: input.password }, headers: authHeaders(request), returnHeaders: true,
      }));
      return { user: publicUser(response.user), cookie: await this.sessionCookie(headers) };
    } catch (cause) {
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

  private async rejectSignup(cause: unknown, email: string): Promise<never> {
    if (!(cause instanceof APIError)) throw unavailable('signup', cause);
    const code = cause.body?.code;
    if (code === 'USER_ALREADY_EXISTS' || code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL') throw emailAlreadyExists();
    if (code === 'FAILED_TO_CREATE_USER') return this.rejectCreation(cause, email);
    if (cause.statusCode < 500 && code && /PASSWORD|EMAIL/.test(code)) {
      throw new AuthError(400, 'VALIDATION_FAILED', 'Invalid signup details.', { cause });
    }
    throw unavailable('signup', cause);
  }

  private async rejectCreation(cause: unknown, email: string): Promise<never> {
    let conflict: { id: string } | undefined;
    try {
      conflict = await this.db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
    } catch (confirmationCause) { throw unavailable('signup', confirmationCause); }
    if (conflict) throw emailAlreadyExists();
    throw unavailable('signup', cause);
  }

  private async sessionCookie(headers: Headers): Promise<string> {
    const name = (await this.auth.$context).authCookies.sessionToken.name;
    const cookies = headers.getSetCookie().filter((value) => value.startsWith(`${name}=`));
    if (cookies.length !== 1) throw new Error('Expected exactly one session cookie.');
    return cookies[0];
  }
}
