import type { IncomingMessage, ServerResponse } from 'node:http';
import { RequestMethod } from '@nestjs/common';
import type { ApiErrorEnvelope } from '@recipe-app/contracts/types';

type RouteInfo = { path: string; method: RequestMethod };

const post = (path: string): RouteInfo => ({ path, method: RequestMethod.POST });

/**
 * Every endpoint that needs email, a password or Google: a Demo account has none, and the demo sends no mail. Display name
 * changes, Categories, recipes, the session read and sign-out stay open.
 */
export const DEMO_REFUSED_ROUTES: RouteInfo[] = [
  ...['signup', 'login', 'resend-verification', 'verify-email', 'forgot-password', 'reset-password', 'google/start', 'google/callback']
    .map((path) => post(`auth/${path}`)),
  ...['google/connect', 'google/disconnect', 'email-change', 'email-change/resend', 'email-change/cancel', 'email-change/confirm', 'password/set-link']
    .map((path) => post(`account/${path}`)),
  { path: 'account/password', method: RequestMethod.PUT },
];

/** Answers before any guard, rate limit or body validation runs, so a refused request changes nothing. */
export function refuseInDemo(_request: IncomingMessage, response: ServerResponse): void {
  response.statusCode = 403;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ code: 'DEMO_UNAVAILABLE', message: 'Not available in the demo.' } satisfies ApiErrorEnvelope));
}
