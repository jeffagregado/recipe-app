import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment.js';

// Placeholder values only; nothing here reaches a real service.
const base = {
  BETTER_AUTH_SECRET: 'unit-test-secret-unit-test-secret-0000',
  BETTER_AUTH_URL: 'http://127.0.0.1:4101',
  DATABASE_URL: 'postgresql://unit:unit-pw@db.example.invalid/unit?sslmode=require',
  AWS_ACCESS_KEY_ID: 'unit-id',
  AWS_SECRET_ACCESS_KEY: 'unit-secret',
  AWS_ENDPOINT_URL_S3: 'https://s3.example.invalid',
  AWS_REGION: 'auto',
  S3_BUCKET: 'unit-bucket',
};
const local = ['http://localhost:3000', 'http://127.0.0.1:3000'];
const origins = (input: Record<string, unknown>) => validateEnvironment({ ...base, ...input }).AUTH_TRUSTED_ORIGINS;
const messageOf = (input: Record<string, unknown>) => {
  try { validateEnvironment({ ...base, ...input }); } catch (error) { return error instanceof Error ? error.message : 'unknown'; }
  throw new Error('Expected validation to fail.');
};

describe('AUTH_TRUSTED_ORIGINS parsing', () => {
  it.each([
    ['[http://localhost:3000, http://127.0.0.1:3000]', ['http://localhost:3000', 'http://127.0.0.1:3000']],
    ['https://a.example,https://b.example', ['https://a.example', 'https://b.example']],
    ['  [ https://a.example ,\thttps://b.example  ]  ', ['https://a.example', 'https://b.example']],
    ['https://a.example', ['https://a.example']],
    ['https://a.example,', ['https://a.example']],
    ['[http://[::1]:3000]', ['http://[::1]:3000']],
  ])('accepts %j', (value, expected) => {
    expect(origins({ AUTH_TRUSTED_ORIGINS: value, NODE_ENV: 'production' })).toEqual(expected);
  });

  it('normalizes entries to exact origins and removes duplicates', () => {
    expect(origins({ AUTH_TRUSTED_ORIGINS: 'https://App.Example.com/, https://app.example.com, HTTP://Local.Example:80/, http://local.example' }))
      .toEqual(['https://app.example.com', 'http://local.example']);
  });

  it('uses a configured list as the whole trusted list without merging local defaults', () => {
    expect(origins({ AUTH_TRUSTED_ORIGINS: 'https://app.example.com' })).toEqual(['https://app.example.com']);
  });

  it.each([
    ['a path', 'https://a.example/app'],
    ['a query', 'https://a.example?next=1'],
    ['an empty query', 'https://a.example/?'],
    ['a fragment', 'https://a.example#frag'],
    ['credentials', 'https://user:marker-pw@a.example'],
    ['a wildcard host', 'https://*.a.example'],
    ['a non-http scheme', 'ftp://a.example'],
    ['a script URL', 'javascript:alert(1)'],
    ['a missing scheme', 'a.example'],
    ['a missing host', 'https://'],
    ['inner whitespace', 'https://a .example'],
    ['one bad entry among good ones', 'https://a.example, https://b.example/path'],
    ['nested brackets', '[[https://a.example]]'],
  ])('rejects %s with a key-only error that never echoes values', (_name, value) => {
    const message = messageOf({ AUTH_TRUSTED_ORIGINS: value });
    expect(message.startsWith('Invalid API configuration:')).toBe(true);
    expect(message.includes('AUTH_TRUSTED_ORIGINS')).toBe(true);
    for (const leaked of ['a.example', 'marker-pw', 'javascript']) expect(message.includes(leaked)).toBe(false);
  });
});

describe('trusted origin resolution', () => {
  it.each([undefined, '', 'development', 'test', 'production-adjacent'])('falls back to exactly the two local origins outside production (NODE_ENV=%s)', (nodeEnv) => {
    expect(origins({ NODE_ENV: nodeEnv })).toEqual(local);
    expect(origins({ NODE_ENV: nodeEnv, AUTH_TRUSTED_ORIGINS: '' })).toEqual(local);
    expect(origins({ NODE_ENV: nodeEnv, AUTH_TRUSTED_ORIGINS: '[]' })).toEqual(local);
  });

  it.each([undefined, '', '[]', '[ , ]'])('refuses to start in production without an origin (AUTH_TRUSTED_ORIGINS=%j)', (value) => {
    const message = messageOf({ NODE_ENV: 'production', AUTH_TRUSTED_ORIGINS: value });
    expect(message.startsWith('Invalid API configuration:')).toBe(true);
    expect(message.includes('AUTH_TRUSTED_ORIGINS')).toBe(true);
    for (const origin of local) expect(message.includes(origin)).toBe(false);
  });

  it('starts in production with a configured list', () => {
    expect(origins({ NODE_ENV: 'production', AUTH_TRUSTED_ORIGINS: '[https://app.example.com]' })).toEqual(['https://app.example.com']);
  });

  it('does not expose NODE_ENV in validated configuration', () => {
    expect('NODE_ENV' in validateEnvironment({ ...base, NODE_ENV: 'production', AUTH_TRUSTED_ORIGINS: 'https://a.example' })).toBe(false);
  });
});
