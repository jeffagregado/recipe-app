import { Logger } from '@nestjs/common';
import { MAIL_CODE, MailError } from '../mail/mail.transport.js';

const logger = new Logger('BetterAuth');

/** Walks the cause chain; yields each Error once. */
function* causes(start: unknown): Generator<Error> {
  const visited = new Set<Error>();
  for (let cause = start; cause instanceof Error && !visited.has(cause); cause = cause.cause) {
    visited.add(cause);
    yield cause;
  }
}

const SQLSTATE = /^[0-9A-Z]{5}$/;
const AUTH_CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

/** The value's `code` when it is a string of the given safe shape. */
function codeMatching(value: unknown, pattern: RegExp): string[] {
  const code = typeof value === 'object' && value !== null && 'code' in value ? value.code : undefined;
  return typeof code === 'string' && pattern.test(code) ? [code] : [];
}

/** Only SQLSTATEs, Better Auth upper-case error codes and mail provider codes are safe to log; messages and other values never are. */
function safeCodes(start: unknown): string[] {
  const codes = new Set<string>();
  for (const cause of causes(start)) {
    const body = 'body' in cause ? cause.body : undefined;
    const mail = cause instanceof MailError ? codeMatching(cause, MAIL_CODE) : [];
    for (const code of [...codeMatching(cause, SQLSTATE), ...codeMatching(body, AUTH_CODE), ...mail]) codes.add(code);
  }
  return [...codes];
}

/** SQL errors can contain credential parameters; log only static event labels and SQLSTATE. */
export function logAuthEvent(level: string, _message: string, ...args: unknown[]): void {
  const codes = [...new Set(args.flatMap((arg) => safeCodes(arg).filter((code) => SQLSTATE.test(code))))];
  const message = `Better Auth ${level} event${codes.length ? ` (SQLSTATE ${codes.join(', ')})` : ''}.`;
  if (level === 'error') logger.error(message);
  else if (level === 'warn') logger.warn(message);
  else logger.debug(message);
}

/** Logs a static operation label, error class names and safe codes; never messages, bodies, cookies or identifiers. */
export function logAuthFailure(operation: string, cause: unknown): void {
  const classes = [...new Set([...causes(cause)].map((error) => error.constructor.name))];
  const codes = safeCodes(cause);
  logger.error(`Auth ${operation} failed: ${classes.join(' <- ') || typeof cause}${codes.length ? ` (code ${codes.join(', ')})` : ''}.`);
}
