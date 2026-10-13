import type { MailMessage } from '../mail/mail.transport.js';

/** A way into an Account. A password is the only one so far; an Account this list does not describe gets the plain wording. */
export type SignInMethod = 'password';

/** Tells the owner of an Account that its address was used at sign-up. `origin` is a trusted origin, never caller text. */
export function accountExistsMessage(to: string, origin: string, methods: readonly SignInMethod[]): MailMessage {
  const signIn = methods.includes('password') ? 'log in with your email and password' : 'log in';
  return {
    kind: 'account-exists',
    to,
    subject: 'Someone tried to sign up with your email',
    html: [
      '<p>Someone tried to sign up for Recipe App with this email address, which already has an account.</p>',
      `<p>If it was you, ${signIn}: <a href="${origin}/">Log in to Recipe App</a></p>`,
      '<p>If it was not you, no action is needed. Your account has not changed.</p>',
    ].join(''),
  };
}
