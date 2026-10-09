import type { IncomingMessage } from 'node:http';
import type { AuthUser } from '@recipe-app/contracts/types';

export type AuthRequest = IncomingMessage & { ip?: string; user?: AuthUser };

export function clientAddress(request: AuthRequest): string {
  const address = request.ip ?? request.socket?.remoteAddress;
  if (!address) throw new Error('Client address unavailable.');
  return address;
}

/** Only the proxy-resolved address and required auth headers reach Better Auth. */
export function authHeaders(request: AuthRequest, withCookie = false): Headers {
  const headers = new Headers({ 'x-forwarded-for': clientAddress(request) });
  if (typeof request.headers['user-agent'] === 'string') headers.set('user-agent', request.headers['user-agent']);
  if (withCookie && typeof request.headers.cookie === 'string') headers.set('cookie', request.headers.cookie);
  return headers;
}
