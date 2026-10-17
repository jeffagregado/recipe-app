import type { ServerResponse } from 'node:http';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { ApiErrorEnvelope, DemoErrorCode } from '@recipe-app/contracts/types';
import { AuthError } from '../auth/auth.errors.js';
import { logAuthFailure } from '../auth/auth.logger.js';

class DemoError extends HttpException {
  constructor(status: number, code: DemoErrorCode | 'SERVICE_UNAVAILABLE', message: string, options: { cause?: unknown } = {}) {
    super({ code, message } satisfies ApiErrorEnvelope, status, { cause: options.cause });
  }
}

export const demoBusy = () => new DemoError(503, 'DEMO_BUSY', 'The demo is busy. Try again later.');

/** Logs the root cause under a static operation label, then builds the 503. */
export function demoUnavailable(operation: string, cause: unknown): DemoError {
  logAuthFailure(operation, cause);
  return new DemoError(503, 'SERVICE_UNAVAILABLE', 'The demo could not start. Try again.', { cause });
}

/** Answers the demo's own errors and the auth guards' and rate limiter's; anything else is a 503 that created nothing. */
@Catch()
export class DemoFilter implements ExceptionFilter {
  catch(cause: unknown, host: ArgumentsHost): void {
    const error = cause instanceof DemoError || cause instanceof AuthError ? cause : demoUnavailable('demo-start', cause);
    const response = host.switchToHttp().getResponse<ServerResponse>();
    response.statusCode = error.getStatus();
    if (error instanceof AuthError && error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(error.getResponse()));
  }
}
