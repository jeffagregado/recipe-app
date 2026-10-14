import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { SessionUser } from './auth.user.js';

/** `user` and `sessionId` are set by SessionGuard. */
export type AuthRequest = IncomingMessage & { ip?: string; user?: SessionUser; sessionId?: string };

/** The web server sends RECIPE_WEB_PROXY_SECRET in this header on every API call. */
export const WEB_PROXY_SECRET_HEADER = 'x-recipe-web-secret';

/** Requests that did not carry the web server's secret, with the hops their address is read at. Set by keyDirectCaller. */
const directCallerHops = new WeakMap<IncomingMessage, number>();

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * `trust proxy` counts the web server as one of the configured hops for every request. A request without the web server's
 * secret is read one hop nearer, at the address the host's proxy saw connect, so an X-Forwarded-For entry it wrote never
 * counts. Hashing both sides gives them one length, so the comparison is constant time whatever was sent.
 */
export function keyDirectCaller(request: IncomingMessage, hops: number, secret: string): void {
  const presented = request.headers[WEB_PROXY_SECRET_HEADER];
  if (typeof presented === 'string' && timingSafeEqual(digest(presented), digest(secret))) return;
  directCallerHops.set(request, Math.max(hops - 1, 0));
}

/** Express's numeric `trust proxy`: the socket peer is hop 0, each X-Forwarded-For entry from the right one more, up to the leftmost. */
function addressAtHop(request: IncomingMessage, hops: number): string | undefined {
  const forwarded = [request.headers['x-forwarded-for'] ?? []].flat().join(',').split(',').map((entry) => entry.trim()).filter(Boolean);
  const chain = [request.socket?.remoteAddress, ...forwarded.reverse()];
  return chain[Math.min(hops, chain.length - 1)];
}

export function clientAddress(request: AuthRequest): string {
  const directHops = directCallerHops.get(request);
  const address = directHops === undefined ? request.ip ?? request.socket?.remoteAddress : addressAtHop(request, directHops);
  if (!address) throw new Error('Client address unavailable.');
  return address;
}

/** The web origin a request came from. Call it only behind OriginGuard, which has matched it against the trusted list. */
export function trustedOrigin(request: AuthRequest): string {
  const origin = request.headers.origin;
  if (typeof origin !== 'string') throw new Error('Request origin unavailable.');
  return origin;
}

/** Only the proxy-resolved address and required auth headers reach Better Auth. */
export function authHeaders(request: AuthRequest, withCookie = false): Headers {
  const headers = new Headers({ 'x-forwarded-for': clientAddress(request) });
  if (typeof request.headers['user-agent'] === 'string') headers.set('user-agent', request.headers['user-agent']);
  if (withCookie && typeof request.headers.cookie === 'string') headers.set('cookie', request.headers.cookie);
  return headers;
}
