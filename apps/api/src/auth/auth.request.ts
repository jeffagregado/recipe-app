import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import type { SessionUser } from './auth.user.js';

/** `user` and `sessionId` are set by SessionGuard. */
export type AuthRequest = IncomingMessage & { user?: SessionUser; sessionId?: string };

/** The web server sends RECIPE_WEB_PROXY_SECRET in this header on every API call. */
const WEB_PROXY_SECRET_HEADER = 'x-recipe-web-secret';
/** Next to the secret, the web server sends the user's IP in this header. */
const CLIENT_IP_HEADER = 'x-recipe-client-ip';

/** The user's IP named by the web server, for requests that carried its secret. Set by trustClientIpHeader. */
const forwardedClients = new WeakMap<IncomingMessage, string>();

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Records the client IP header of a request that carries the web server's secret: only the web server knows it, so only
 * its requests may name the client. X-Forwarded-For is not read, because a host such as Vercel overwrites it. Hashing both sides gives them one length, so the comparison is constant time
 * whatever was sent. A missing or malformed IP leaves the request on its connecting address, as does any other caller.
 */
export function trustClientIpHeader(request: IncomingMessage, secret: string): void {
  const presented = request.headers[WEB_PROXY_SECRET_HEADER];
  const client = request.headers[CLIENT_IP_HEADER];
  if (typeof presented !== 'string' || !timingSafeEqual(digest(presented), digest(secret))) return;
  if (typeof client === 'string' && isIP(client) !== 0) forwardedClients.set(request, client);
}

export function clientAddress(request: AuthRequest): string {
  const address = forwardedClients.get(request) ?? request.socket?.remoteAddress;
  if (!address) throw new Error('Client address unavailable.');
  return address;
}

/** The web origin a request came from. Call it only behind OriginGuard, which has matched it against the trusted list. */
export function trustedOrigin(request: AuthRequest): string {
  const origin = request.headers.origin;
  if (typeof origin !== 'string') throw new Error('Request origin unavailable.');
  return origin;
}

/** Only the resolved client address and required auth headers reach Better Auth. */
export function authHeaders(request: AuthRequest, withCookie = false): Headers {
  const headers = new Headers({ 'x-forwarded-for': clientAddress(request) });
  if (typeof request.headers['user-agent'] === 'string') headers.set('user-agent', request.headers['user-agent']);
  if (withCookie && typeof request.headers.cookie === 'string') headers.set('cookie', request.headers.cookie);
  return headers;
}
