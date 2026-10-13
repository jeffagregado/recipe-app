import type { IncomingMessage } from 'node:http';
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DrizzleDb } from '../database/database.service.js';
import { createAuth } from './auth.js';
import { googleDisplayName } from './auth.google.js';
import { GoogleSignInService } from './google.service.js';

describe('Google display name', () => {
  it.each([
    ['Ana Google', 'Ana Google'],
    ['  Ana\u0000 Goo\u0007gle\n ', 'Ana Google'],
    [`${'a'.repeat(99)} bcd`, 'a'.repeat(99)],
    ['', 'ana.maria'],
    [' \u0001 ', 'ana.maria'],
    [undefined, 'ana.maria'],
  ])('turns %j into %j', (name, expected) => {
    expect(googleDisplayName(name, 'ana.maria@example.invalid')).toBe(expected);
  });
});

describe('Google sign-in without a configured client', () => {
  it('refuses to start with GOOGLE_SIGN_IN_FAILED and logs the cause by class and code only', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    // No client id or secret: the provider is absent, so the refusal comes before any database call.
    const auth = createAuth({} as DrizzleDb, { BETTER_AUTH_SECRET: 'unit-test-secret-unit-test-secret-0000', BETTER_AUTH_URL: 'http://127.0.0.1:4101', AUTH_TRUSTED_ORIGINS: ['http://localhost:3000'] });
    const request = { headers: {}, ip: '127.0.0.1' } as IncomingMessage & { ip: string };
    await expect(new GoogleSignInService(auth).start(request)).rejects.toMatchObject({ status: 400, response: { code: 'GOOGLE_SIGN_IN_FAILED', message: 'Google sign-in failed. Try again.' } });
    expect(error.mock.calls.map(([line]) => line)).toContain('Auth google-start failed: APIError (code PROVIDER_NOT_FOUND).');
    error.mockRestore();
  });
});
