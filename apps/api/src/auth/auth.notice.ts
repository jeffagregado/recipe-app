import type { MailMessage } from '../mail/mail.transport.js';

/** A way into an Account. An Account this list does not describe gets the plain wording. */
export type SignInMethod = 'password' | 'google';

const SIGN_IN_WORDING: Record<SignInMethod, string> = { password: 'log in with your email and password', google: 'sign in with Google' };

/** Tells the owner of an Account that its address was used at sign-up. `origin` is a trusted origin, never caller text. */
export function accountExistsMessage(to: string, origin: string, methods: readonly SignInMethod[]): MailMessage {
  const signIn = (['password', 'google'] as const).filter((method) => methods.includes(method)).map((method) => SIGN_IN_WORDING[method]).join(', or ') || 'log in';
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
