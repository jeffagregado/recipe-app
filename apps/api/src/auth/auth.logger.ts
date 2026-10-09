import { Logger } from '@nestjs/common';

const logger = new Logger('BetterAuth');

/** Walks the cause chain; yields each Error once. */
function* causes(start: unknown): Generator<Error> {
  const visited = new Set<Error>();
  for (let cause = start; cause instanceof Error && !visited.has(cause); cause = cause.cause) {
    visited.add(cause);
    yield cause;
  }
}

/** Only SQLSTATEs and Better Auth upper-case error codes are safe to log; messages and other values never are. */
function safeCodes(start: unknown): string[] {
  const codes = new Set<string>();
  for (const cause of causes(start)) {
    if ('code' in cause && typeof cause.code === 'string' && /^[0-9A-Z]{5}$/.test(cause.code)) codes.add(cause.code);
    const body = 'body' in cause ? cause.body : undefined;
    const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined;
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(code)) codes.add(code);
  }
  return [...codes];
}

/** SQL errors can contain credential parameters; log only static event labels and SQLSTATE. */
export function logAuthEvent(level: string, _message: string, ...args: unknown[]): void {
  const codes = [...new Set(args.flatMap((arg) => safeCodes(arg).filter((code) => /^[0-9A-Z]{5}$/.test(code))))];
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
