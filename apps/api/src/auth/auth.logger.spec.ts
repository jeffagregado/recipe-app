import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailError } from '../mail/mail.transport.js';
import { logAuthEvent, logAuthFailure } from './auth.logger.js';

const sqlError = (code: string, message: string, cause?: unknown) => Object.assign(new Error(message, { cause }), { code });

describe('auth logging', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs error classes and safe codes from the cause chain, never messages or bodies', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const apiError = Object.assign(new TypeError('secret-user cookie=abc token=xyz'), { body: { code: 'USER_ALREADY_EXISTS', message: 'secret-body' } });
    logAuthFailure('signup', sqlError('23505', 'duplicate key for secret-user', apiError));
    expect(error).toHaveBeenCalledExactlyOnceWith('Auth signup failed: Error <- TypeError (code 23505, USER_ALREADY_EXISTS).');
  });

  it('ignores unsafe or malformed codes and survives cyclic causes', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const first = sqlError('not a code', 'secret');
    const second = Object.assign(new RangeError('secret', { cause: first }), { code: 123, body: { code: 'lower_case' } });
    first.cause = second;
    logAuthFailure('login', second);
    expect(error).toHaveBeenCalledExactlyOnceWith('Auth login failed: RangeError <- Error.');
    logAuthFailure('login', 'plain string');
    expect(error).toHaveBeenLastCalledWith('Auth login failed: string.');
  });

  it.each([
    ['a mail error with a provider code', new Error('signup', { cause: new MailError('validation_error') }), 'Auth signup failed: Error <- MailError (code validation_error).'],
    ['a code-less mail error as its class name only', new MailError(), 'Auth signup failed: MailError.'],
    ['a mail error with an unsafe code as its class name only', new MailError('secret@example.invalid'), 'Auth signup failed: MailError.'],
    ['another error without its lower-case code', Object.assign(new Error('secret'), { code: 'validation_error' }), 'Auth signup failed: Error.'],
  ])('logs %s', (_case, cause, line) => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    logAuthFailure('signup', cause);
    expect(error).toHaveBeenCalledExactlyOnceWith(line);
  });

  it('logs only the level and SQLSTATE for Better Auth events', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    logAuthEvent('warn', 'email secret@example.invalid failed', sqlError('23505', 'secret'), { body: { code: 'USER_ALREADY_EXISTS' } });
    expect(warn).toHaveBeenCalledExactlyOnceWith('Better Auth warn event (SQLSTATE 23505).');
    logAuthEvent('info', 'secret', { code: 'ABCDE' });
    expect(debug).toHaveBeenCalledExactlyOnceWith('Better Auth info event.');
  });
});
