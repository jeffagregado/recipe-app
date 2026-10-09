import type { z } from 'zod';
import { AuthError } from './auth.errors.js';

export function validateAuth<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  // Prototype-free: keys like constructor or __proto__ must be plain entries.
  const fieldErrors: Record<string, string[]> = Object.create(null);
  for (const issue of result.error.issues) {
    const keys = issue.code === 'unrecognized_keys' ? issue.keys : [issue.path.join('.') || 'body'];
    for (const key of keys) (fieldErrors[key] ??= []).push(issue.code === 'unrecognized_keys' ? 'Unexpected field.' : issue.message);
  }
  throw new AuthError(400, 'VALIDATION_FAILED', 'Check the submitted fields.', { fieldErrors });
}
