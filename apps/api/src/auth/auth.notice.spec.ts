import { describe, expect, it } from 'vitest';
import { accountExistsMessage } from './auth.notice.js';

describe('Account-exists notice', () => {
  it('tells a password Account to log in with its email and password, linking the login page of the given origin', () => {
    expect(accountExistsMessage('owner@example.invalid', 'https://app.example.invalid', ['password'])).toEqual({
      kind: 'account-exists',
      to: 'owner@example.invalid',
      subject: 'Someone tried to sign up with your email',
      html: '<p>Someone tried to sign up for Recapp with this email address, which already has an account.</p>'
        + '<p>If it was you, log in with your email and password: <a href="https://app.example.invalid/">Log in to Recapp</a></p>'
        + '<p>If it was not you, no action is needed. Your account has not changed.</p>',
    });
  });

  it.each([
    ['a Google Account to sign in with Google', ['google'], 'sign in with Google'],
    ['an Account with both Sign-in methods that it can use either', ['google', 'password'], 'log in with your email and password, or sign in with Google'],
    ['an Account it cannot describe only to log in', [], 'log in'],
  ] as const)('tells %s', (_label, methods, wording) => {
    const { html } = accountExistsMessage('owner@example.invalid', 'https://app.example.invalid', methods);
    expect(html).toBe('<p>Someone tried to sign up for Recapp with this email address, which already has an account.</p>'
      + `<p>If it was you, ${wording}: <a href="https://app.example.invalid/">Log in to Recapp</a></p>`
      + '<p>If it was not you, no action is needed. Your account has not changed.</p>');
  });
});
