import { Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type { Environment } from '../config/environment.js';

/** A closed list, so the one thing the logging transport prints can never carry caller data. */
export type MailKind = 'verification' | 'account-exists' | 'password-reset' | 'email-change' | 'email-change-notice';

export type MailMessage = { kind: MailKind; to: string; subject: string; html: string };

export interface MailTransport {
  /** Sends one message to one address. */
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

const logger = new Logger('Mail');

/** Stands in when no key is set. Logs the kind only; never the address, subject or body. */
class LoggingMailTransport implements MailTransport {
  send({ kind }: MailMessage): Promise<void> {
    logger.log(`Mail not sent, no Resend key is set: a ${kind} message was produced.`);
    return Promise.resolve();
  }
}

export const MAIL_CODE = /^[a-z][a-z_]{1,63}$/;

/** Carries the provider's error code when it has the safe shape; never its message, which can quote the recipient. */
export class MailError extends Error {
  override readonly name = 'MailError';

  constructor(readonly code?: string) {
    super('Mail delivery failed.');
  }
}

class ResendMailTransport implements MailTransport {
  private readonly client: Resend;

  constructor(apiKey: string, private readonly from: string) {
    this.client = new Resend(apiKey);
    // The SDK prints every provider error to the console outside production, and a refusal can quote the recipient.
    // `logError` is private to the SDK: the exact version pin and the unit test that expects no log output guard this override.
    Object.defineProperty(this.client, 'logError', { value: () => undefined });
  }

  async send({ to, subject, html }: MailMessage): Promise<void> {
    const { error } = await this.client.emails.send({ from: this.from, to, subject, html });
    if (error) throw new MailError(MAIL_CODE.test(error.name) ? error.name : undefined);
  }
}

export function createMailTransport({ RESEND_API_KEY, MAIL_FROM }: Pick<Environment, 'RESEND_API_KEY' | 'MAIL_FROM'>): MailTransport {
  return RESEND_API_KEY ? new ResendMailTransport(RESEND_API_KEY, MAIL_FROM) : new LoggingMailTransport();
}
