import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import type { GoogleCallbackInput } from '@recipe-app/contracts/types';
import { DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { authAccounts, authVerifications } from '../database/schema.js';
import { AUTH } from './auth.tokens.js';
import type { RecipeAuth } from './auth.js';
import { AuthError, emailNotVerified, googleAlreadyConnected, googleAlreadyLinked, googleConnectEmailNotVerified, googleConnectFailed, googleEmailNotVerified, googleSignInFailed } from './auth.errors.js';
import { GOOGLE_EMAIL_NOT_VERIFIED, GOOGLE_PROVIDER_ID, googleExchange } from './auth.google.js';
import { logAuthFailure } from './auth.logger.js';
import { authHeaders } from './auth.request.js';
import type { AuthRequest } from './auth.request.js';

/**
 * Why Better Auth refused a callback, shaped like its own errors so the log keeps the code: the `error` parameter of a
 * refusing redirect (`state_mismatch`, `invalid_code`, `account_not_linked`), or the code of an error body.
 */
class GoogleCallbackRefused extends Error {
  readonly body: { code: string };

  constructor(reason: unknown) {
    super('Google callback refused.');
    this.body = { code: (typeof reason === 'string' ? reason : 'unknown').replace(/[^a-z0-9]+/gi, '_').toUpperCase().slice(0, 64) };
  }
}

/** The `error` of the redirect Better Auth answers when an email matches an Account it will not attach the identity to. */
const ACCOUNT_NOT_LINKED = 'account_not_linked';
/** The `error` of the redirect Better Auth answers when a connect brings an identity that another Account holds. */
const LINKED_TO_ANOTHER = 'account_already_linked_to_different_user';

/** Where Better Auth 1.7.7 keeps a flow's state until the callback: one verification row per state. */
const stateIdentifier = (state: string) => `auth-state:${state}`;

/**
 * The part of a stored state this wrapper reads before Better Auth does. `link` is Better Auth's own mark of a flow
 * started for a signed-in Account; `connectSession` is added by `startConnect`. The two fields Better Auth requires of
 * every state are required here too, so a row this cannot read is refused instead of being taken for a sign-in.
 */
const storedStateSchema = z.object({
  callbackURL: z.string(),
  codeVerifier: z.string(),
  link: z.object({ userId: z.string() }).optional(),
  connectSession: z.string().optional(),
});

type PendingConnect = { userId: string; sessionId: string | undefined };

/** What a completed callback did: opened a session, or attached the identity to the Account that asked. */
export type GoogleCompletion = { flow: 'sign-in'; cookie: string } | { flow: 'connect' };

/** Reads a callback response Better Auth answered: a refusing redirect, an error body, or nothing to object to. */
async function refusalOf(response: Response): Promise<{ code: unknown } | undefined> {
  // Anything but a redirect is an error body; the only one this API raises itself is the unverified Google address.
  if (response.status !== 302) {
    const body: unknown = await response.json().catch(() => undefined);
    return { code: typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined };
  }
  const reason = new URL(response.headers.get('location') ?? '', 'http://refused.invalid').searchParams.get('error');
  return reason === null ? undefined : { code: reason };
}

/** The answer to a sign-in Better Auth refused. */
function signInRefusal(code: unknown): AuthError {
  if (code === GOOGLE_EMAIL_NOT_VERIFIED) return googleEmailNotVerified();
  // With linking configured as it is, Better Auth declines to attach at sign-in for one reason only: the matching Account's
  // email is not Verified. Google has verified the address for the caller, so naming the Account's state tells them nothing new.
  if (code === ACCOUNT_NOT_LINKED) return emailNotVerified(new GoogleCallbackRefused(code));
  return googleSignInFailed('google-callback', new GoogleCallbackRefused(code));
}

/** The answer to a connect Better Auth refused, under codes no sign-in is answered with. */
function connectRefusal(code: unknown): AuthError {
  if (code === GOOGLE_EMAIL_NOT_VERIFIED) return googleConnectEmailNotVerified();
  if (code === LINKED_TO_ANOTHER) return googleAlreadyLinked();
  return googleConnectFailed('google-callback', new GoogleCallbackRefused(code));
}

/** Drives Better Auth's social sign-in, account link and OAuth callback in process, so the native routes stay closed. */
@Injectable()
export class GoogleSignInService {
  constructor(@Inject(AUTH) private readonly auth: RecipeAuth, @Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  /**
   * Builds the provider URL. The PKCE verifier stays in the verifications table under the state; the browser gets only
   * the signed state cookie, which must come back with the callback.
   */
  async start(request: AuthRequest): Promise<{ url: string; cookie: string }> {
    try {
      const { response, headers } = await this.auth.api.signInSocial({
        body: { provider: GOOGLE_PROVIDER_ID, disableRedirect: true }, headers: authHeaders(request), returnHeaders: true,
      });
      if (!response.url) throw new Error('Provider URL missing.');
      return { url: response.url, cookie: await this.onlyCookie(headers, 'state') };
    } catch (cause) { throw googleSignInFailed('google-start', cause); }
  }

  /**
   * Builds the provider URL for a signed-in Account that wants Google as a second Sign-in method. Better Auth marks the
   * state as a link for that Account; the session that asked is stored beside the mark, and `complete` attaches the
   * identity only to a callback that still carries that session.
   */
  async startConnect(request: AuthRequest, userId: string, sessionId: string): Promise<{ url: string; cookie: string }> {
    let connected: number;
    try { connected = await this.db.$count(authAccounts, and(eq(authAccounts.userId, userId), eq(authAccounts.providerId, GOOGLE_PROVIDER_ID))); }
    catch (cause) { throw googleConnectFailed('google-connect-start', cause); }
    if (connected > 0) throw googleAlreadyConnected();
    try {
      const { response, headers } = await this.auth.api.linkSocialAccount({
        body: { provider: GOOGLE_PROVIDER_ID, disableRedirect: true, additionalData: { connectSession: sessionId } },
        headers: authHeaders(request, true), returnHeaders: true,
      });
      if (!response.url) throw new Error('Provider URL missing.');
      return { url: response.url, cookie: await this.onlyCookie(headers, 'state') };
    } catch (cause) { throw googleConnectFailed('google-connect-start', cause); }
  }

  /**
   * Completes the exchange for a forwarded code and state. A flow started as a sign-in answers the session cookie; one
   * started as a connect attaches the identity to the Account that started it and answers no cookie. Either refuses and
   * sets nothing.
   */
  async complete(input: GoogleCallbackInput, request: AuthRequest): Promise<GoogleCompletion> {
    const connect = await this.pendingConnect(input.state);
    if (connect) await this.requireStarter(connect, input.state, request);
    const failed = connect ? googleConnectFailed : googleSignInFailed;
    const exchange: { identity?: { sub: string; email: string } } = {};
    let response: Response;
    try {
      response = await googleExchange.run(exchange, () => this.auth.api.callbackOAuth({
        method: 'GET', query: input, params: { id: GOOGLE_PROVIDER_ID }, headers: authHeaders(request, true), asResponse: true,
      }));
    } catch (cause) { throw failed('google-callback', cause); }
    const refusal = await refusalOf(response);
    if (refusal) throw connect ? connectRefusal(refusal.code) : signInRefusal(refusal.code);
    const completion: GoogleCompletion = connect ? { flow: 'connect' } : { flow: 'sign-in', cookie: await this.sessionCookie(response.headers) };
    await this.keepAddress(exchange.identity);
    return completion;
  }

  private async sessionCookie(headers: Headers): Promise<string> {
    try { return await this.onlyCookie(headers, 'session_token'); }
    catch (cause) { throw googleSignInFailed('google-callback', cause); }
  }

  /**
   * Whether the state belongs to a flow started as a connect, read before Better Auth consumes it. A state with no row
   * is left for Better Auth to refuse.
   */
  private async pendingConnect(state: string): Promise<PendingConnect | undefined> {
    let stored: { value: string } | undefined;
    try { [stored] = await this.db.select({ value: authVerifications.value }).from(authVerifications).where(eq(authVerifications.identifier, stateIdentifier(state))).limit(1); }
    catch (cause) { throw googleSignInFailed('google-callback', cause); }
    if (!stored) return undefined;
    let parsed: z.infer<typeof storedStateSchema>;
    try { parsed = storedStateSchema.parse(JSON.parse(stored.value)); }
    catch (cause) { throw googleSignInFailed('google-callback', cause); }
    return parsed.link ? { userId: parsed.link.userId, sessionId: parsed.connectSession } : undefined;
  }

  /**
   * A connect attaches only for the session that started it, still signed in, and so only to that session's Account.
   * Better Auth itself would attach to the Account named in the state whoever brings the callback. A callback from
   * anyone else spends the flow and attaches nothing.
   */
  private async requireStarter(connect: PendingConnect, state: string, request: AuthRequest): Promise<void> {
    try {
      const session = await this.auth.api.getSession({ headers: authHeaders(request, true) });
      if (session && session.session.id === connect.sessionId && session.user.id === connect.userId) return;
      await this.db.delete(authVerifications).where(eq(authVerifications.identifier, stateIdentifier(state)));
    } catch (cause) {
      if (cause instanceof AuthError) throw cause;
      throw googleConnectFailed('google-callback', cause);
    }
    throw googleConnectFailed('google-callback', new GoogleCallbackRefused('connect_session_missing'));
  }

  /**
   * Keeps the address Google reported on the identity's own record, so Settings can name it. Tokens and the rest of the
   * profile are still discarded. A failure is logged and not raised: the sign-in or connect has already happened, and
   * the next Google sign-in writes the address again.
   */
  private async keepAddress(identity: { sub: string; email: string } | undefined): Promise<void> {
    if (!identity) return;
    try {
      await this.db.update(authAccounts).set({ providerEmail: identity.email }).where(and(
        eq(authAccounts.providerId, GOOGLE_PROVIDER_ID), eq(authAccounts.accountId, identity.sub),
        or(isNull(authAccounts.providerEmail), ne(authAccounts.providerEmail, identity.email)),
      ));
    } catch (cause) { logAuthFailure('google-address', cause); }
  }

  private async onlyCookie(headers: Headers, cookie: 'state' | 'session_token'): Promise<string> {
    const { name } = (await this.auth.$context).createAuthCookie(cookie);
    const cookies = headers.getSetCookie().filter((value) => value.startsWith(`${name}=`));
    if (cookies.length !== 1) throw new Error(`Expected exactly one ${cookie} cookie.`);
    return cookies[0];
  }
}
