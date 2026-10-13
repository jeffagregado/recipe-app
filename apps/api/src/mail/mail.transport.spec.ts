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

  describe('without a Resend key', () => {
    it('sends nothing and logs only the kind of message produced', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const logged = captureLogs();
      const log = vi.mocked(Logger.prototype.log);

      await createMailTransport({ MAIL_FROM }).send(message);

      expect(fetch).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledExactlyOnceWith('Mail not sent, no Resend key is set: a verification message was produced.');
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
});
