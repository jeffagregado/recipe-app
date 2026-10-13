import { Inject, Injectable } from '@nestjs/common';
import type { GoogleCallbackInput } from '@recipe-app/contracts/types';
import { AUTH } from './auth.tokens.js';
import type { RecipeAuth } from './auth.js';
import { googleEmailNotVerified, googleSignInFailed } from './auth.errors.js';
import { GOOGLE_EMAIL_NOT_VERIFIED, GOOGLE_PROVIDER_ID } from './auth.google.js';
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

/** Drives Better Auth's social sign-in and OAuth callback in process, so the native routes stay closed. */
@Injectable()
export class GoogleSignInService {
  constructor(@Inject(AUTH) private readonly auth: RecipeAuth) {}

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

  /** Completes the exchange for a forwarded code and state. Answers the session cookie, or refuses and sets nothing. */
  async complete(input: GoogleCallbackInput, request: AuthRequest): Promise<string> {
    let response: Response;
    try {
      response = await this.auth.api.callbackOAuth({
        method: 'GET', query: input, params: { id: GOOGLE_PROVIDER_ID }, headers: authHeaders(request, true), asResponse: true,
      });
    } catch (cause) { throw googleSignInFailed('google-callback', cause); }
    // Anything but a redirect is an error body; the only one this API raises itself is the unverified Google address.
    if (response.status !== 302) {
      const body: unknown = await response.json().catch(() => undefined);
      const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined;
      throw code === GOOGLE_EMAIL_NOT_VERIFIED ? googleEmailNotVerified() : googleSignInFailed('google-callback', new GoogleCallbackRefused(code));
    }
    const reason = new URL(response.headers.get('location') ?? '', 'http://refused.invalid').searchParams.get('error');
    if (reason !== null) throw googleSignInFailed('google-callback', new GoogleCallbackRefused(reason));
    try { return await this.onlyCookie(response.headers, 'session_token'); }
    catch (cause) { throw googleSignInFailed('google-callback', cause); }
  }

  private async onlyCookie(headers: Headers, cookie: 'state' | 'session_token'): Promise<string> {
    const { name } = (await this.auth.$context).createAuthCookie(cookie);
    const cookies = headers.getSetCookie().filter((value) => value.startsWith(`${name}=`));
    if (cookies.length !== 1) throw new Error(`Expected exactly one ${cookie} cookie.`);
    return cookies[0];
  }
}
