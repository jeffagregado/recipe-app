import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailTransport, MailError } from './mail.transport.js';
import type { MailMessage } from './mail.transport.js';

const MAIL_FROM = 'Kitchen <mail@send.example.invalid>';
const message: MailMessage = {
  kind: 'verification',
  to: 'marker-recipient@example.invalid',
  subject: 'marker-subject',
  html: '<p>marker-body <a href="https://app.example.invalid/verify?token=marker-token">Verify</a></p>',
};
const sensitive = ['marker-recipient', 'example.invalid', 'marker-subject', 'marker-body', 'marker-token', 're_unit'];

/** Every argument of every call to the Nest logger and the console, as one string. */
function captureLogs() {
  const spies = [
    ...(['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const).map((level) => vi.spyOn(Logger.prototype, level).mockImplementation(() => undefined)),
    ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined)),
  ];
  return () => JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

describe('mail transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('without a Gmail account or Resend key', () => {
    it('sends nothing and logs only the kind of message produced', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const logged = captureLogs();
      const log = vi.mocked(Logger.prototype.log);

      await createMailTransport({ MAIL_FROM }).send(message);

      expect(fetch).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledExactlyOnceWith('Mail not sent, no Gmail account or Resend key is set: a verification message was produced.');
      for (const value of sensitive) expect(logged().includes(value)).toBe(false);
    });
  });

  describe('with a Resend key', () => {
    const transport = () => createMailTransport({ MAIL_FROM, RESEND_API_KEY: 're_unit_placeholder' });
    const respond = (status: number, body: unknown) => vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));

    it('sends the message through Resend from the configured sender and logs nothing', async () => {
      const fetch = respond(200, { id: 'unit-message-id' });
      vi.stubGlobal('fetch', fetch);
      const logged = captureLogs();

      await transport().send(message);

      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = fetch.mock.calls[0];
      expect(url).toBe('https://api.resend.com/emails');
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer re_unit_placeholder');
      expect(JSON.parse(String(init?.body))).toEqual({
        from: 'Kitchen <mail@send.example.invalid>',
        to: 'marker-recipient@example.invalid',
        subject: 'marker-subject',
        html: '<p>marker-body <a href="https://app.example.invalid/verify?token=marker-token">Verify</a></p>',
      });
      expect(logged()).toBe('[]');
    });

    it.each([
      ['a refusal that quotes the recipient', () => respond(403, { statusCode: 403, name: 'validation_error', message: 'You can only send testing emails to your own address, not marker-recipient@example.invalid.' }), 'validation_error'],
      ['a refusal with an unsafe name', () => respond(422, { statusCode: 422, name: 'marker-recipient@example.invalid', message: 'marker-body' }), undefined],
      ['an unreachable service', () => vi.fn<typeof fetch>(() => Promise.reject(new TypeError('connect failed for marker-recipient@example.invalid'))), 'application_error'],
    ])('fails on %s with a safe code and logs nothing', async (_name, fetch, code) => {
      vi.stubGlobal('fetch', fetch());
      const logged = captureLogs();

      const failure: unknown = await transport().send(message).catch((error: unknown) => error);

      if (!(failure instanceof MailError)) throw new Error('Expected a MailError.');
      expect([failure.message, failure.code, failure.cause]).toEqual(['Mail delivery failed.', code, undefined]);
      expect(logged()).toBe('[]');
    });
  });

  describe('with a Gmail account', () => {
    const GMAIL = { clientId: 'unit-gmail-client', clientSecret: 'unit-gmail-secret', refreshToken: 'unit-refresh-token' };
    const TOKEN_URL = 'https://oauth2.googleapis.com/token';
    const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
    /** Resend is configured too: Gmail takes precedence. */
    const transport = (from = 'Kitchen <kitchen@gmail.com>') => createMailTransport({ MAIL_FROM: from, RESEND_API_KEY: 're_unit_placeholder', GMAIL });
    const token = (accessToken: string, expiresIn = 3599) => Response.json({ access_token: accessToken, expires_in: expiresIn, scope: 'https://www.googleapis.com/auth/gmail.send', token_type: 'Bearer' });
    const sent = () => Response.json({ id: 'unit-message-id', threadId: 'unit-thread-id', labelIds: ['SENT'] });

    /** A fetch that answers each call with the next response in order. */
    function stubGoogle(...responses: (() => Response | Promise<Response>)[]) {
      const fetch = vi.fn<typeof globalThis.fetch>(() => {
        const next = responses.shift();
        if (!next) throw new Error('Unexpected fetch.');
        return Promise.resolve(next());
      });
      vi.stubGlobal('fetch', fetch);
      return fetch;
    }

    /** The decoded message of a send call, with its headers split from its body. */
    function sentMessage(init: RequestInit | undefined) {
      const { raw } = JSON.parse(String(init?.body)) as { raw: string };
      expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
      const mime = Buffer.from(raw, 'base64url').toString('utf8');
      const [head, body] = mime.split('\r\n\r\n');
      return { mime, headers: head.split('\r\n'), body };
    }

    it('refreshes an access token, sends the message as the account and logs nothing', async () => {
      const fetch = stubGoogle(() => token('unit-access-1'), sent);
      const logged = captureLogs();

      await transport().send(message);

      expect(fetch).toHaveBeenCalledTimes(2);
      const [[tokenUrl, tokenInit], [sendUrl, sendInit]] = fetch.mock.calls;
      expect(tokenUrl).toBe(TOKEN_URL);
      expect(tokenInit?.method).toBe('POST');
      expect(tokenInit?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(tokenInit?.headers).get('Content-Type')).toBe('application/x-www-form-urlencoded');
      expect(Object.fromEntries(new URLSearchParams(String(tokenInit?.body)))).toEqual({
        client_id: 'unit-gmail-client',
        client_secret: 'unit-gmail-secret',
        refresh_token: 'unit-refresh-token',
        grant_type: 'refresh_token',
      });

      expect(sendUrl).toBe(SEND_URL);
      expect(sendInit?.method).toBe('POST');
      expect(sendInit?.signal).toBeInstanceOf(AbortSignal);
      const headers = new Headers(sendInit?.headers);
      expect(headers.get('Authorization')).toBe('Bearer unit-access-1');
      expect(headers.get('Content-Type')).toBe('application/json');
      const { mime, headers: lines, body } = sentMessage(sendInit);
      expect(lines).toEqual([
        'From: Kitchen <kitchen@gmail.com>',
        'To: marker-recipient@example.invalid',
        'Subject: marker-subject',
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
      ]);
      expect(mime.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
      expect(body.split('\r\n').map((line) => line.length)).toEqual([76, 48]);
      expect(Buffer.from(body, 'base64').toString('utf8')).toBe('<p>marker-body <a href="https://app.example.invalid/verify?token=marker-token">Verify</a></p>');
      expect(logged()).toBe('[]');
    });

    it('reuses the access token until a minute before it expires, then refreshes it', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-14T00:00:00Z') });
      const fetch = stubGoogle(() => token('unit-access-1', 3600), sent, sent, () => token('unit-access-2', 3600), sent);
      const gmail = transport();
      const bearers = () => fetch.mock.calls.filter(([url]) => url === SEND_URL).map(([, init]) => new Headers(init?.headers).get('Authorization'));

      try {
        await gmail.send(message);
        vi.setSystemTime(new Date('2026-10-14T00:58:59Z'));
        await gmail.send(message);
        vi.setSystemTime(new Date('2026-10-14T00:59:00Z'));
        await gmail.send(message);
      } finally {
        vi.useRealTimers();
      }

      expect(fetch.mock.calls.map(([url]) => url)).toEqual([TOKEN_URL, SEND_URL, SEND_URL, TOKEN_URL, SEND_URL]);
      expect(bearers()).toEqual(['Bearer unit-access-1', 'Bearer unit-access-1', 'Bearer unit-access-2']);
    });

    const unauthenticated = () => Response.json({ error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } }, { status: 401 });

    it('refreshes the token once on a 401 and retries the send', async () => {
      const fetch = stubGoogle(() => token('unit-access-1'), unauthenticated, () => token('unit-access-2'), sent);

      await transport().send(message);

      expect(fetch.mock.calls.map(([url, init]) => [url, new Headers(init?.headers).get('Authorization')])).toEqual([
        [TOKEN_URL, null],
        [SEND_URL, 'Bearer unit-access-1'],
        [TOKEN_URL, null],
        [SEND_URL, 'Bearer unit-access-2'],
      ]);
      // One deadline covers every call of a send, so a retry never extends how long the request is held.
      expect(new Set(fetch.mock.calls.map(([, init]) => init?.signal)).size).toBe(1);
    });

    it('gives up after one retry when Google refuses the fresh token too', async () => {
      const fetch = stubGoogle(() => token('unit-access-1'), unauthenticated, () => token('unit-access-2'), unauthenticated);

      const failure: unknown = await transport().send(message).catch((caught: unknown) => caught);

      expect(fetch).toHaveBeenCalledTimes(4);
      if (!(failure instanceof MailError)) throw new Error('Expected a MailError.');
      expect(failure.code).toBe('unauthenticated');
    });

    const refused = (status: number, body: unknown) => () => Response.json(body, { status });
    const unreachable = () => Promise.reject(new TypeError('connect failed for marker-recipient@example.invalid'));

    it.each([
      ['a revoked refresh token', [refused(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked for marker-recipient@example.invalid.' })], 'invalid_grant'],
      ['a token refusal with an unsafe error', [refused(400, { error: 'marker-recipient@example.invalid', error_description: 'marker-body' })], undefined],
      ['a token response that is not JSON', [() => new Response('marker-body', { status: 502 })], undefined],
      ['an unreachable token endpoint', [unreachable], undefined],
      ['a send refusal that quotes the recipient', [() => token('unit-access-1'), refused(403, { error: { code: 403, message: 'Mail to marker-recipient@example.invalid refused: marker-subject', status: 'PERMISSION_DENIED' } })], 'permission_denied'],
      ['a send refusal with an unsafe status', [() => token('unit-access-1'), refused(400, { error: { code: 400, message: 'marker-body', status: 'marker-recipient@example.invalid' } })], undefined],
      ['a send response that is not JSON', [() => token('unit-access-1'), () => new Response('marker-body', { status: 500 })], undefined],
      ['an unreachable send endpoint', [() => token('unit-access-1'), unreachable], undefined],
    ])('fails on %s with a safe code and logs nothing', async (_name, responses, code) => {
      stubGoogle(...responses);
      const logged = captureLogs();

      const failure: unknown = await transport().send(message).catch((caught: unknown) => caught);

      if (!(failure instanceof MailError)) throw new Error('Expected a MailError.');
      expect([failure.message, failure.code, failure.cause]).toEqual(['Mail delivery failed.', code, undefined]);
      expect(logged()).toBe('[]');
    });

    it('encodes a non-ASCII sender name and subject as RFC 2047 UTF-8 words', async () => {
      const fetch = stubGoogle(() => token('unit-access-1'), sent);

      await transport('Cuisine Élise <kitchen@gmail.com>').send({ ...message, subject: 'Vérifiez votre adresse' });

      const { headers } = sentMessage(fetch.mock.calls[1][1]);
      expect(headers.slice(0, 3)).toEqual([
        'From: =?UTF-8?B?Q3Vpc2luZSDDiWxpc2U=?= <kitchen@gmail.com>',
        'To: marker-recipient@example.invalid',
        'Subject: =?UTF-8?B?VsOpcmlmaWV6IHZvdHJlIGFkcmVzc2U=?=',
      ]);
    });

    it('folds a long non-ASCII subject into lines of at most 76 characters, splitting no character', async () => {
      const fetch = stubGoogle(() => token('unit-access-1'), sent);
      const subject = 'Réinitialisez votre mot de passe 🍲 pour votre compte de recettes, s’il vous plaît';

      await transport().send({ ...message, subject });

      // The words decode to "Réinitialisez votre mot de passe 🍲 ", "pour votre compte de recettes, s’il v" and "ous plaît".
      const { headers } = sentMessage(fetch.mock.calls[1][1]);
      expect(headers.slice(2, 5)).toEqual([
        'Subject: =?UTF-8?B?UsOpaW5pdGlhbGlzZXogdm90cmUgbW90IGRlIHBhc3NlIPCfjbIg?=',
        ' =?UTF-8?B?cG91ciB2b3RyZSBjb21wdGUgZGUgcmVjZXR0ZXMsIHPigJlpbCB2?=',
        ' =?UTF-8?B?b3VzIHBsYcOudA==?=',
      ]);
      expect(Math.max(...headers.slice(2, 5).map((line) => line.length))).toBe(73);
    });

    it.each([
      ['a recipient', { to: 'marker-recipient@example.invalid\r\nBcc: other@example.invalid' }],
      ['a subject', { subject: 'marker-subject\nBcc: other@example.invalid' }],
      ['a subject with a lone carriage return', { subject: 'marker-subject\rBcc: other@example.invalid' }],
    ])('refuses a line break in %s before calling Google', async (_name, input) => {
      const fetch = stubGoogle();
      const logged = captureLogs();

      const failure: unknown = await transport().send({ ...message, ...input }).catch((caught: unknown) => caught);

      if (!(failure instanceof MailError)) throw new Error('Expected a MailError.');
      expect(failure.code).toBeUndefined();
      expect(fetch).not.toHaveBeenCalled();
      expect(logged()).toBe('[]');
    });
  });
});
