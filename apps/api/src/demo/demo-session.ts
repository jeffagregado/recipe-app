import { makeSignature } from 'better-auth/crypto';
import type { RecipeAuth } from '../auth/auth.js';

type CookieAttributes = { maxAge?: number; domain?: string; path?: string; httpOnly?: boolean; secure?: boolean; sameSite?: string };

function serializeCookie(name: string, value: string, { domain, path, httpOnly, secure, sameSite, maxAge }: CookieAttributes): string {
  return [
    `${name}=${value}`,
    maxAge === undefined ? '' : `; Max-Age=${maxAge}`,
    domain ? `; Domain=${domain}` : '',
    path ? `; Path=${path}` : '',
    httpOnly ? '; HttpOnly' : '',
    secure ? '; Secure' : '',
    sameSite ? `; SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1)}` : '',
  ].join('');
}

/**
 * Stores a session for the Account that ends at `expiresAt`, instead of the usual seven days, and returns its cookie. The
 * cookie is the one Better Auth sets at login: its name and attributes, and the token signed with the auth secret.
 */
export async function createDemoSession(auth: RecipeAuth, userId: string, expiresAt: Date, client: { ipAddress: string; userAgent: string }): Promise<string> {
  const context = await auth.$context;
  // The last argument applies these values over Better Auth's defaults, its seven-day expiry included.
  const session = await context.internalAdapter.createSession(userId, false, { expiresAt, ...client }, true);
  const { name, attributes } = context.authCookies.sessionToken;
  const signed = encodeURIComponent(`${session.token}.${await makeSignature(session.token, context.secret)}`);
  return serializeCookie(name, signed, { ...attributes, maxAge: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) });
}
