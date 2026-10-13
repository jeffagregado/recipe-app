import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { GoogleEndpoints } from '../src/auth/auth.google.js';

/** The fields of Google's userinfo answer that the API reads. */
export type GoogleIdentity = { sub: string; email: string; email_verified: boolean; name?: string };

/** What the API sent to the token endpoint, kept so a suite can check the redirect URI and the PKCE verifier. */
type Exchange = { code: string; redirectUri: string | null; codeVerifier: string | null };

/** Fake credentials for the suite's own process environment; they match nothing real. */
export const STAND_IN_CLIENT = { id: 'stand-in-client-id', secret: 'stand-in-client-secret' } as const;

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function formBody(request: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function clientOf(request: IncomingMessage, form: URLSearchParams): { id: string | null; secret: string | null } {
  const basic = /^Basic (.+)$/.exec(request.headers.authorization ?? '');
  if (!basic) return { id: form.get('client_id'), secret: form.get('client_secret') };
  const [id, secret] = Buffer.from(basic[1], 'base64').toString('utf8').split(':').map(decodeURIComponent);
  return { id, secret };
}

/**
 * A local HTTP server that answers Google's token and userinfo endpoints with fixtures, so no suite calls Google.
 * A code is issued for an identity with `consent`, exchanged once, and its access token then reads that identity.
 */
export async function startGoogleStandIn() {
  const consents = new Map<string, GoogleIdentity>();
  const tokens = new Map<string, GoogleIdentity>();
  const exchanges: Exchange[] = [];
  let issued = 0;

  /** Exchanges a consented code once for an access token that reads its identity. */
  async function token(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const form = await formBody(request);
    const client = clientOf(request, form);
    if (client.id !== STAND_IN_CLIENT.id || client.secret !== STAND_IN_CLIENT.secret) { send(response, 401, { error: 'invalid_client' }); return; }
    const code = form.get('code') ?? '';
    exchanges.push({ code, redirectUri: form.get('redirect_uri'), codeVerifier: form.get('code_verifier') });
    const identity = consents.get(code);
    if (!identity) { send(response, 400, { error: 'invalid_grant' }); return; }
    consents.delete(code);
    const accessToken = `stand-in-access-${++issued}`;
    tokens.set(accessToken, identity);
    send(response, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: 3599, scope: 'openid email profile' });
  }

  function userInfo(request: IncomingMessage, response: ServerResponse): void {
    const identity = tokens.get(/^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1] ?? '');
    if (identity) send(response, 200, identity);
    else send(response, 401, { error: 'invalid_token' });
  }

  const server = createServer((request, response) => {
    const route = `${request.method} ${request.url?.split('?')[0]}`;
    if (route === 'POST /token') token(request, response).catch(() => { send(response, 500, { error: 'server_error' }); });
    else if (route === 'GET /userinfo') userInfo(request, response);
    else send(response, 404, { error: 'not_found' });
  });
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // The consent screen is never opened: a suite only reads the URL the API builds for it.
  const endpoints: GoogleEndpoints = { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: `${origin}/token`, userInfoUrl: `${origin}/userinfo` };

  return {
    endpoints,
    exchanges,
    /** The code Google would append to the callback after this person consents. */
    consent(identity: GoogleIdentity): string {
      const code = `stand-in-code-${++issued}`;
      consents.set(code, identity);
      return code;
    },
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve(); }); }),
  };
}
