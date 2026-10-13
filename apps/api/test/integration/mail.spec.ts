import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAIL_TRANSPORT } from '../../src/mail/mail.transport.js';
import type { MailTransport } from '../../src/mail/mail.transport.js';
import { startApi } from '../auth-harness.js';

describe('Mail in the test harness', () => {
  let api: Awaited<ReturnType<typeof startApi>> | undefined;
  beforeAll(async () => { api = await startApi(); }, 60_000);
  afterAll(async () => { await api?.app.close(); }, 60_000);

  it('records the messages the API sends in order', async () => {
    if (!api) throw new Error('The API did not start.');
    const transport = api.app.get<MailTransport>(MAIL_TRANSPORT);

    await transport.send({ kind: 'verification', to: 'first@example.invalid', subject: 'Verify your email', html: '<p>First</p>' });
    await transport.send({ kind: 'account-exists', to: 'second@example.invalid', subject: 'You already have an account', html: '<p>Second</p>' });

    expect(api.mail.messages).toEqual([
      { kind: 'verification', to: 'first@example.invalid', subject: 'Verify your email', html: '<p>First</p>' },
      { kind: 'account-exists', to: 'second@example.invalid', subject: 'You already have an account', html: '<p>Second</p>' },
    ]);
  });
});
