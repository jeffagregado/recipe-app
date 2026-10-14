import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
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
      expect(log).toHaveBeenCalledExactlyOnceWith('Mail not sent, no SMTP server or Resend key is set: a verification message was produced.');
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

  describe('with an SMTP server', () => {
    const smtp = { host: 'smtp.example.invalid', port: 465, user: 'kitchen@send.example.invalid', password: 'unit-app-password' };
    /** Resend is configured too: SMTP takes precedence. */
    const transport = (settings = smtp) => createMailTransport({ MAIL_FROM, RESEND_API_KEY: 're_unit_placeholder', SMTP: settings });
    const createTransport = nodemailer.createTransport.bind(nodemailer);

    /** Hands nodemailer's own JSON transport, or one that fails as given, to the code under test in place of the SMTP connection. */
    function stubSmtp(failure?: Error) {
      const sendMail = vi.fn<(options: object) => Promise<unknown>>();
      const create = vi.spyOn(nodemailer, 'createTransport').mockImplementation(() => {
        const json = createTransport({ jsonTransport: true });
        const send = json.sendMail.bind(json);
        sendMail.mockImplementation((options) => failure ? Promise.reject(failure) : send(options));
        return Object.assign(json, { sendMail });
      });
      return { create, sendMail };
    }

    it('sends one message over verified TLS from the configured sender instead of Resend, and logs nothing', async () => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const { create, sendMail } = stubSmtp();
      const logged = captureLogs();

      await transport().send(message);

      expect(fetch).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledExactlyOnceWith({
        host: 'smtp.example.invalid',
        port: 465,
        secure: true,
        requireTLS: true,
        auth: { user: 'kitchen@send.example.invalid', pass: 'unit-app-password' },
        tls: { rejectUnauthorized: true },
        logger: false,
        debug: false,
      });
      expect(sendMail).toHaveBeenCalledExactlyOnceWith({
        from: 'Kitchen <mail@send.example.invalid>',
        to: 'marker-recipient@example.invalid',
        subject: 'marker-subject',
        html: '<p>marker-body <a href="https://app.example.invalid/verify?token=marker-token">Verify</a></p>',
      });
      expect(logged()).toBe('[]');
    });

    it('upgrades with STARTTLS on any other port, and requires it', async () => {
      const { create } = stubSmtp();

      await transport({ ...smtp, port: 587 }).send(message);

      expect(create.mock.calls[0]?.[0]).toMatchObject({ port: 587, secure: false, requireTLS: true, tls: { rejectUnauthorized: true } });
    });

    it.each([
      ['a refused login that quotes the account', Object.assign(new Error('Invalid login: 535 kitchen@send.example.invalid marker-body'), { code: 'EAUTH', responseCode: 535, response: '535 marker-recipient@example.invalid' }), 'eauth'],
      ['a refused recipient', Object.assign(new Error('Can\'t send mail - all recipients were rejected: 550 marker-recipient@example.invalid'), { code: 'EENVELOPE', responseCode: 550, rejected: ['marker-recipient@example.invalid'] }), 'eenvelope'],
      ['a failure with an unsafe code', Object.assign(new Error('marker-body'), { code: 'marker-recipient@example.invalid' }), undefined],
      ['a failure without a code', new Error('connect failed for marker-recipient@example.invalid'), undefined],
    ])('fails on %s with a safe code and logs nothing', async (_name, error, code) => {
      stubSmtp(error);
      const logged = captureLogs();

      const failure: unknown = await transport().send(message).catch((caught: unknown) => caught);

      if (!(failure instanceof MailError)) throw new Error('Expected a MailError.');
      expect([failure.message, failure.code, failure.cause]).toEqual(['Mail delivery failed.', code, undefined]);
      expect(logged()).toBe('[]');
    });

    it('never signs in or sends over a server that does not offer STARTTLS', async () => {
      const commands: string[] = [];
      const server = createServer((socket) => {
        socket.write('220 stub.example.invalid ESMTP\r\n');
        socket.on('data', (chunk) => {
          for (const line of chunk.toString().split('\r\n').filter(Boolean)) {
            const command = line.split(' ')[0].toUpperCase();
            commands.push(command);
            socket.write({ EHLO: '250-stub.example.invalid\r\n250 AUTH PLAIN LOGIN\r\n', STARTTLS: '454 4.7.0 TLS not available\r\n' }[command] ?? '250 OK\r\n');
          }
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address() as AddressInfo;
      const logged = captureLogs();

      try {
        const failure: unknown = await transport({ ...smtp, host: '127.0.0.1', port }).send(message).catch((caught: unknown) => caught);

        if (!(failure instanceof MailError)) throw new Error('Expected a MailError.');
        expect(failure.code).toBe('etls');
        expect(commands).toEqual(['EHLO', 'STARTTLS']);
        expect(logged()).toBe('[]');
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});
