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
const messageOf = (input: Record<string, unknown>) => {
  try { validateEnvironment({ ...base, ...input }); } catch (error) { return error instanceof Error ? error.message : 'unknown'; }
  throw new Error('Expected validation to fail.');
};

describe('DEMO_MODE parsing', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['  ', false],
    ['false', false],
    ['true', true],
  ])('reads %j as %j', (value, expected) => {
    expect(validateEnvironment({ ...base, DEMO_MODE: value }).DEMO_MODE).toBe(expected);
  });

  it.each(['1', 'yes', 'TRUE', 'on'])('refuses %j with a key-only error', (value) => {
    const message = messageOf({ DEMO_MODE: value });
    expect(message.startsWith('Invalid API configuration: DEMO_MODE.')).toBe(true);
  });

  it('refuses a mail key in demo mode, so the demo can send no mail', () => {
    const message = messageOf({ DEMO_MODE: 'true', RESEND_API_KEY: 're_unit_key' });
    expect(message.startsWith('Invalid API configuration: RESEND_API_KEY.')).toBe(true);
    expect(message.includes('re_unit_key')).toBe(false);
  });

  it('keeps a mail key outside demo mode', () => {
    expect(validateEnvironment({ ...base, RESEND_API_KEY: 're_unit_key' }).RESEND_API_KEY).toBe('re_unit_key');
  });
});
