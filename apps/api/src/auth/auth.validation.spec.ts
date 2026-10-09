import { loginSchema, signupSchema } from '@recipe-app/contracts/schemas';
import { describe, expect, it } from 'vitest';
import { validateAuth } from './auth.validation.js';

const signup = { displayName: 'Unit User', username: 'unit_user', password: 'unit-password-123' };
const login = { username: 'unit_user', password: 'unit-password-123' };

function failure(schema: Parameters<typeof validateAuth>[0], body: unknown) {
  try { validateAuth(schema, body); } catch (error) { return error as { getStatus(): number; getResponse(): { code: string; fieldErrors?: Record<string, string[]> } }; }
  throw new Error('Expected validation to fail.');
}

describe('validateAuth', () => {
  it.each([
    ['signup', signupSchema, signup],
    ['login', loginSchema, login],
  ] as const)('returns parsed %s data', (_name, schema, body) => {
    expect(validateAuth(schema, body)).toEqual(body);
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty'])('answers 400 with a field error for unknown key %s', (key) => {
    for (const [schema, body] of [[signupSchema, signup], [loginSchema, login]] as const) {
      const payload = JSON.parse(JSON.stringify({ ...body }).replace("{", `{${JSON.stringify(key)}:1,`));
      const error = failure(schema, payload);
      expect(error.getStatus()).toBe(400);
      expect(error.getResponse().code).toBe('VALIDATION_FAILED');
      expect(Object.getOwnPropertyDescriptor(error.getResponse().fieldErrors, key)?.value).toEqual(['Unexpected field.']);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    }
  });

  it('reports ordinary field errors and unknown keys together', () => {
    const error = failure(loginSchema, { username: '', password: 'x', extra: true });
    expect(error.getResponse().fieldErrors).toMatchObject({ extra: ['Unexpected field.'] });
    expect(Object.keys(error.getResponse().fieldErrors ?? {})).toContain('username');
  });
});
