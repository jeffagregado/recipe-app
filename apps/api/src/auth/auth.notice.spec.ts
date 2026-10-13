import { describe, expect, it } from 'vitest';
import { accountExistsMessage } from './auth.notice.js';

describe('Account-exists notice', () => {
  it('tells a password Account to log in with its email and password, linking the login page of the given origin', () => {
    expect(accountExistsMessage('owner@example.invalid', 'https://app.example.invalid', ['password'])).toEqual({
      kind: 'account-exists',
      to: 'owner@example.invalid',
      subject: 'Someone tried to sign up with your email',
      html: '<p>Someone tried to sign up for Recipe App with this email address, which already has an account.</p>'
        + '<p>If it was you, log in with your email and password: <a href="https://app.example.invalid/">Log in to Recipe App</a></p>'
        + '<p>If it was not you, no action is needed. Your account has not changed.</p>',
    });
  });

  it('names no password to an Account that has none', () => {
    const { html } = accountExistsMessage('owner@example.invalid', 'https://app.example.invalid', []);
    expect(html).toContain('<p>If it was you, log in: <a href="https://app.example.invalid/">Log in to Recipe App</a></p>');
    expect(html).not.toContain('password');
  });
});
