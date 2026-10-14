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

describe('mail configuration', () => {
  it.each([{}, { RESEND_API_KEY: '', MAIL_FROM: '' }, { RESEND_API_KEY: '  ', MAIL_FROM: '  ' }])('runs without a key and with the onboarding sender by default (%j)', (input) => {
    const config = validateEnvironment({ ...base, ...input });
    expect(config.RESEND_API_KEY).toBeUndefined();
    expect(config.MAIL_FROM).toBe('Recipe App <onboarding@resend.dev>');
  });

  it.each([
    ['Kitchen <mail@send.example.com>', 'Kitchen <mail@send.example.com>'],
    ['  mail@send.example.com ', 'mail@send.example.com'],
  ])('accepts the configured sender %j', (value, expected) => {
    const config = validateEnvironment({ ...base, RESEND_API_KEY: ' re_unit_placeholder ', MAIL_FROM: value });
    expect(config.MAIL_FROM).toBe(expected);
    expect(config.RESEND_API_KEY).toBe('re_unit_placeholder');
  });

  it.each([
    ['a sender without an address', 'MAIL_FROM', 'Kitchen marker-value'],
    ['a sender with two addresses', 'MAIL_FROM', 'a@marker-value.example, b@marker-value.example'],
    ['a sender with a line break', 'MAIL_FROM', 'Kitchen <mail@marker-value.example>\nBcc: x@marker-value.example'],
    ['a sender whose name holds an address', 'MAIL_FROM', 'a@marker-value.example <mail@marker-value.example>'],
    ['a sender with an unbalanced quote', 'MAIL_FROM', '"marker-value <mail@marker-value.example>'],
    ['a sender with a tab in its name', 'MAIL_FROM', 'marker-value	Kitchen <mail@marker-value.example>'],
    ['a key with inner whitespace', 'RESEND_API_KEY', 're_marker-value other'],
  ])('rejects %s with a key-only error that never echoes values', (_name, key, value) => {
    const message = messageOf({ [key]: value });
    expect(message.startsWith('Invalid API configuration:')).toBe(true);
    expect(message.includes(key)).toBe(true);
    expect(message.includes('marker-value')).toBe(false);
  });
});

describe('Google sign-in configuration', () => {
  const localCallback = 'http://localhost:3000/api/auth/callback/google';
  const google = { GOOGLE_CLIENT_ID: 'unit-client-id', GOOGLE_CLIENT_SECRET: 'unit-client-marker-value' };
  const read = (input: Record<string, unknown>) => {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = validateEnvironment({ ...base, ...input });
    return { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI };
  };

  it.each([{}, { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', GOOGLE_REDIRECT_URI: '' }, { GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: '  ' }])('starts without Google (%j)', (input) => {
    expect(read(input)).toEqual({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_REDIRECT_URI: localCallback });
    expect(read({ ...input, NODE_ENV: 'production', AUTH_TRUSTED_ORIGINS: 'https://app.example.com' }).GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it('defaults the redirect URI to the local web callback outside production', () => {
    expect(read(google)).toEqual({ ...google, GOOGLE_REDIRECT_URI: localCallback });
  });

  it('keeps a configured redirect URI on the web callback path', () => {
    expect(read({ ...google, GOOGLE_REDIRECT_URI: ' https://app.example.com/api/auth/callback/google ', NODE_ENV: 'production', AUTH_TRUSTED_ORIGINS: 'https://app.example.com' }).GOOGLE_REDIRECT_URI)
      .toBe('https://app.example.com/api/auth/callback/google');
  });

  it.each([
    ['an id without a secret', { GOOGLE_CLIENT_ID: 'marker-value' }, 'GOOGLE_CLIENT_SECRET'],
    ['a secret without an id', { GOOGLE_CLIENT_SECRET: 'marker-value' }, 'GOOGLE_CLIENT_ID'],
    ['an id with inner whitespace', { ...google, GOOGLE_CLIENT_ID: 'marker-value other' }, 'GOOGLE_CLIENT_ID'],
    ['a redirect URI on another path', { ...google, GOOGLE_REDIRECT_URI: 'https://marker-value.example/callback' }, 'GOOGLE_REDIRECT_URI'],
    ['a redirect URI with a query', { ...google, GOOGLE_REDIRECT_URI: 'https://marker-value.example/api/auth/callback/google?next=1' }, 'GOOGLE_REDIRECT_URI'],
    ['a redirect URI with credentials', { ...google, GOOGLE_REDIRECT_URI: 'https://user:marker-value@a.example/api/auth/callback/google' }, 'GOOGLE_REDIRECT_URI'],
    ['a redirect URI that is not http(s)', { ...google, GOOGLE_REDIRECT_URI: 'ftp://marker-value.example/api/auth/callback/google' }, 'GOOGLE_REDIRECT_URI'],
    ['Google in production without a redirect URI', { ...google, NODE_ENV: 'production', AUTH_TRUSTED_ORIGINS: 'https://app.example.com' }, 'GOOGLE_REDIRECT_URI'],
  ])('rejects %s with a key-only error that never echoes values', (_name, input, key) => {
    const message = messageOf(input);
    expect(message.startsWith('Invalid API configuration:')).toBe(true);
    expect(message.includes(key)).toBe(true);
    expect(message.includes('marker-value')).toBe(false);
  });
});

describe('TRUST_PROXY_HOPS parsing', () => {
  const hops = (input: Record<string, unknown>) => validateEnvironment({ ...base, ...input }).TRUST_PROXY_HOPS;

  it.each([
    [undefined, 0],
    ['', 0],
    ['  ', 0],
    ['0', 0],
    ['1', 1],
    ['2', 2],
    [' 3 ', 3],
  ])('reads %j as %i trusted hops', (value, expected) => {
    expect(hops({ TRUST_PROXY_HOPS: value })).toBe(expected);
  });

  it.each([
    ['a negative count', '-1'],
    ['a fraction', '1.5'],
    ['a word', 'two'],
    ['a list', '1,2'],
  ])('rejects %s with a key-only error', (_name, value) => {
    const message = messageOf({ TRUST_PROXY_HOPS: value });
    expect(message.startsWith('Invalid API configuration:')).toBe(true);
    expect(message.includes('TRUST_PROXY_HOPS')).toBe(true);
  });
});
