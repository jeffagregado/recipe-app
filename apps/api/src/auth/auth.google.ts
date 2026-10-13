import { APIError } from 'better-auth/api';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { z } from 'zod';
import { emailSchema } from '@recipe-app/contracts/schemas';
import { DISPLAY_NAME_MAX_LENGTH } from '@recipe-app/contracts/types';

export const GOOGLE_PROVIDER_ID = 'google';

/** Raised inside the exchange and read back by the wrapper, so an unproven address is told apart from every other failure. */
export const GOOGLE_EMAIL_NOT_VERIFIED = 'GOOGLE_EMAIL_NOT_VERIFIED';

export type GoogleEndpoints = { authorizationUrl: string; tokenUrl: string; userInfoUrl: string };

/** Injection token for the endpoints. Only a test replaces them, with a local stand-in; no environment variable can. */
export const GOOGLE_ENDPOINTS = Symbol('GOOGLE_ENDPOINTS');

export const googleEndpoints: GoogleEndpoints = {
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
};

export type GoogleClient = { clientId: string; clientSecret: string; redirectUri: string };

const googleProfileSchema = z.object({
  sub: z.string().min(1).max(255),
  email: emailSchema,
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

/** Google's name made to fit the display-name rules; a person whose name leaves nothing is called by their mailbox. */
export function googleDisplayName(name: string | undefined, email: string): string {
  const clean = (value: string) => value.replace(/\p{Cc}/gu, '').trim().slice(0, DISPLAY_NAME_MAX_LENGTH).trim();
  return clean(name ?? '') || clean(email.split('@')[0]) || 'Google user';
}

/**
 * Google as a generic OAuth provider. Better Auth's built-in Google provider fixes its token endpoint, so it cannot be
 * pointed at a test stand-in; this one names every endpoint. The profile is read from the userinfo endpoint with the
 * access token of the exchange, never from an unverified token body.
 */
export function googleSignIn(client: GoogleClient, endpoints: GoogleEndpoints) {
  return genericOAuth({
    config: [{
      providerId: GOOGLE_PROVIDER_ID,
      name: 'Google',
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      authorizationUrl: endpoints.authorizationUrl,
      tokenUrl: endpoints.tokenUrl,
      scopes: ['openid', 'email', 'profile'],
      // The web origin owns the callback (ADR 0004): never derived from the API's own base URL.
      redirectURI: client.redirectUri,
      pkce: true,
      accountSubject: ({ profile }) => String(profile.sub),
      getUserInfo: async (tokens) => {
        if (!tokens.accessToken) return null;
        const response = await fetch(endpoints.userInfoUrl, {
          headers: { Authorization: `Bearer ${tokens.accessToken}` }, redirect: 'error', signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return null;
        const profile = googleProfileSchema.safeParse(await response.json());
        if (!profile.success) return null;
        // ADR 0003: an address Google itself has not verified never becomes an Account.
        if (profile.data.email_verified !== true) {
          throw new APIError('FORBIDDEN', { code: GOOGLE_EMAIL_NOT_VERIFIED, message: 'Google has not verified this email address.' });
        }
        const { sub, email } = profile.data;
        return { id: sub, sub, email, emailVerified: true, name: googleDisplayName(profile.data.name, email) };
      },
    }],
  });
}
