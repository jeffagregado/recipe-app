import { describe, expect, it } from 'vitest';
import { resetMessage } from './auth.reset.js';
import { verificationMessage } from './auth.verification.js';

describe('Link messages', () => {
  it.each([
    ['verification', verificationMessage, 'Verify your email',
      '<p>Welcome to Recapp. Verify your email to finish signing up.</p>'
        + '<p><a href="https://app.example.invalid/verify-email?token=abc">Verify my email</a></p>'
        + '<p>The link works once and expires in 24 hours. If you did not sign up, you can ignore this email.</p>'],
    ['password-reset', resetMessage, 'Reset your password',
      '<p>We received a request to reset the password of your Recapp account.</p>'
        + '<p><a href="https://app.example.invalid/reset-password?token=abc">Choose a new password</a></p>'
        + '<p>The link works once and expires in one hour. If you did not ask for it, you can ignore this email and your password stays the same.</p>'],
  ] as const)('names the app Recapp in the %s message', (kind, build, subject, html) => {
    expect(build('owner@example.invalid', 'https://app.example.invalid', 'abc')).toEqual({ kind, to: 'owner@example.invalid', subject, html });
  });
});
