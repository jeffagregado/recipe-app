import type { MailMessage } from '../mail/mail.transport.js';

/** A way into an Account. An Account this list does not describe gets the plain wording. */
export type SignInMethod = 'password' | 'google';

/** In the order the notice names them. */
const SIGN_IN_WORDING: readonly (readonly [SignInMethod, string])[] = [['password', 'log in with your email and password'], ['google', 'sign in with Google']];

/** Tells the owner of an Account that its address was used at sign-up. `origin` is a trusted origin, never caller text. */
export function accountExistsMessage(to: string, origin: string, methods: readonly SignInMethod[]): MailMessage {
  const signIn = SIGN_IN_WORDING.filter(([method]) => methods.includes(method)).map(([, wording]) => wording).join(', or ') || 'log in';
  return {
    kind: 'account-exists',
    to,
    subject: 'Someone tried to sign up with your email',
    html: [
      '<p>Someone tried to sign up for Recapp with this email address, which already has an account.</p>',
      `<p>If it was you, ${signIn}: <a href="${origin}/">Log in to Recapp</a></p>`,
      '<p>If it was not you, no action is needed. Your account has not changed.</p>',
    ].join(''),
  };
}
