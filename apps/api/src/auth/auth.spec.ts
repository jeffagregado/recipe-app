import { describe, expect, it } from 'vitest';
import type { DrizzleDb } from '../database/database.service.js';
import { createAuth } from './auth.js';

const secret = 'unit-test-secret-unit-test-secret-0000';

/** Cookie settings are resolved from options alone, so no database round trip happens. */
async function sessionCookie(baseUrl: string, origins: string[]) {
  const auth = createAuth({} as DrizzleDb, { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: baseUrl, AUTH_TRUSTED_ORIGINS: origins });
  const { authCookies, options } = await auth.$context;
  return { name: authCookies.sessionToken.name, secure: authCookies.sessionToken.attributes.secure, trusted: options.trustedOrigins };
}

describe('createAuth trusted origins and cookie security', () => {
  it('issues the Secure __Secure- session cookie when every trusted origin is HTTPS, even for an HTTP base URL', async () => {
    expect(await sessionCookie('http://api.internal:3001', ['https://app.example.com', 'https://www.example.com']))
      .toEqual({ name: '__Secure-better-auth.session_token', secure: true, trusted: ['https://app.example.com', 'https://www.example.com'] });
  });

  it.each([
    ['mixed', ['https://app.example.com', 'http://localhost:3000']],
    ['HTTP-only', ['http://localhost:3000', 'http://127.0.0.1:3000']],
  ])('derives the cookie from the base URL when the %s trusted list has an HTTP origin', async (_name, origins) => {
    expect(await sessionCookie('http://127.0.0.1:4101', origins)).toMatchObject({ name: 'better-auth.session_token', secure: false });
    expect(await sessionCookie('https://api.example.com', origins)).toMatchObject({ name: '__Secure-better-auth.session_token', secure: true });
  });
});
