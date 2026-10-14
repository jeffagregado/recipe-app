import { Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type { Environment, GmailAccount } from '../config/environment.js';

/** A closed list, so the one thing the logging transport prints can never carry caller data. */
export type MailKind = 'verification' | 'account-exists' | 'password-reset' | 'email-change' | 'email-change-notice';

export type MailMessage = { kind: MailKind; to: string; subject: string; html: string };

export interface MailTransport {
  /** Sends one message to one address. */
  send(message: MailMessage): Promise<void>;
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

const logger = new Logger('Mail');

/** Stands in when no mail service is set. Logs the kind only; never the address, subject or body. */
class LoggingMailTransport implements MailTransport {
  send({ kind }: MailMessage): Promise<void> {
    logger.log(`Mail not sent, no Gmail account or Resend key is set: a ${kind} message was produced.`);
    return Promise.resolve();
  }
}

export const MAIL_CODE = /^[a-z][a-z_]{1,63}$/;
const safeCode = (code: unknown) => (typeof code === 'string' && MAIL_CODE.test(code) ? code : undefined);

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
    if (error) throw new MailError(safeCode(error.name));
  }
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
/** Every Google call of one send, a token refresh and a retry included, ends by then, so a hung call never holds a request. */
const SEND_DEADLINE_MS = 10_000;
/** An access token is replaced this many seconds before Google's `expires_in` runs out. */
const TOKEN_REFRESH_MARGIN_S = 60;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** One Google call with its JSON body; an unreachable or hung service fails without a code, since its error can quote the request. */
async function callGoogle(url: string, init: RequestInit & { signal: AbortSignal }): Promise<{ status: number; body: unknown }> {
  try {
    const response = await fetch(url, { ...init, method: 'POST' });
    return { status: response.status, body: await response.json().catch(() => undefined) };
  } catch {
    throw new MailError();
  }
}

/** UTF-8 bytes per RFC 2047 encoded word: 52 base64 characters, 64 with the delimiters, so `Subject: ` and a word fit RFC 2047's 76-character line. */
const ENCODED_WORD_BYTES = 39;

/** Printable ASCII as is; anything else as UTF-8 encoded words, folded onto continuation lines, each holding whole characters. */
function encodeHeaderText(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const words: string[] = [''];
  for (const character of text) {
    const word = words[words.length - 1] + character;
    if (Buffer.byteLength(word) > ENCODED_WORD_BYTES) words.push(character);
    else words[words.length - 1] = word;
  }
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word).toString('base64')}?=`).join('\r\n ');
}

/** `Name <address>` with the name encoded, or a bare address as is. */
function encodeSender(sender: string): string {
  const named = /^(.+) (<[^<>]+>)$/.exec(sender);
  return named ? `${encodeHeaderText(named[1])} ${named[2]}` : sender;
}

/** An RFC 5322 message with an HTML body; Gmail adds the Date and Message-ID. */
function mimeMessage(from: string, { to, subject, html }: MailMessage): string {
  // A line break in a header value would start a new header, such as a Bcc.
  if ([from, to, subject].some((value) => /[\r\n]/.test(value))) throw new MailError();
  const headers = [`From: ${encodeSender(from)}`, `To: ${to}`, `Subject: ${encodeHeaderText(subject)}`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64'];
  const body = Buffer.from(html, 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return `${headers.join('\r\n')}\r\n\r\n${body}`;
}

/** Sends as the account that granted the refresh token, through the Gmail API over HTTPS. */
class GmailMailTransport implements MailTransport {
  private accessToken?: { value: string; refreshAt: number };
  /** Shared by concurrent sends, so one refresh serves them all. */
  private refreshing?: Promise<string>;

  constructor(private readonly account: GmailAccount, private readonly from: string) {}

  async send(message: MailMessage): Promise<void> {
    const raw = Buffer.from(mimeMessage(this.from, message), 'utf8').toString('base64url');
    const signal = AbortSignal.timeout(SEND_DEADLINE_MS);
    let response = await this.post(raw, await this.currentAccessToken(signal), signal);
    if (response.status === 401) {
      // Google revoked or expired the token early: one fresh token, one retry.
      this.accessToken = undefined;
      response = await this.post(raw, await this.currentAccessToken(signal), signal);
    }
    if (response.status < 200 || response.status > 299) {
      // Google's message can quote the recipient; its upper-case status, such as PERMISSION_DENIED, cannot.
      const { body } = response;
      const status = isRecord(body) && isRecord(body.error) && typeof body.error.status === 'string' ? body.error.status.toLowerCase() : undefined;
      throw new MailError(safeCode(status));
    }
  }

  private post(raw: string, accessToken: string, signal: AbortSignal) {
    return callGoogle(GMAIL_SEND_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
      signal,
    });
  }

  /** A send that joins a refresh already under way waits at most for that refresh's earlier deadline. */
  private currentAccessToken(signal: AbortSignal): Promise<string> {
    if (this.accessToken && Date.now() < this.accessToken.refreshAt) return Promise.resolve(this.accessToken.value);
    this.refreshing ??= this.refreshAccessToken(signal).finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }

  private async refreshAccessToken(signal: AbortSignal): Promise<string> {
    const { body } = await callGoogle(GOOGLE_TOKEN_URL, {
      signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.account.clientId,
        client_secret: this.account.clientSecret,
        refresh_token: this.account.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!isRecord(body) || typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
      // Google's `error`, such as invalid_grant, is a fixed code; its error_description is free text.
      throw new MailError(isRecord(body) ? safeCode(body.error) : undefined);
    }
    this.accessToken = { value: body.access_token, refreshAt: Date.now() + (body.expires_in - TOKEN_REFRESH_MARGIN_S) * 1000 };
    return body.access_token;
  }
}

/** Gmail when an account is set, else Resend when a key is set, else the logging transport. */
export function createMailTransport({ GMAIL, RESEND_API_KEY, MAIL_FROM }: Pick<Environment, 'GMAIL' | 'RESEND_API_KEY' | 'MAIL_FROM'>): MailTransport {
  if (GMAIL) return new GmailMailTransport(GMAIL, MAIL_FROM);
  return RESEND_API_KEY ? new ResendMailTransport(RESEND_API_KEY, MAIL_FROM) : new LoggingMailTransport();
}
