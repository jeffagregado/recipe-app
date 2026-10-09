import type { ServerResponse } from 'node:http';
import { Catch } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { AuthError } from './auth.errors.js';
import { logAuthFailure } from './auth.logger.js';

@Catch()
export class AuthFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    // 503s are logged where they are raised, with their operation label.
    if (!(error instanceof AuthError)) logAuthFailure('unhandled', error);
    const response = host.switchToHttp().getResponse<ServerResponse>();
    response.statusCode = error instanceof AuthError ? error.getStatus() : 500;
    if (error instanceof AuthError && error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(error instanceof AuthError ? error.getResponse() : { code: 'INTERNAL_ERROR', message: 'Authentication request failed.' }));
  }
}
