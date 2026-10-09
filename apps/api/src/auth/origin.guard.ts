import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { authOrigins } from './auth.js';
import { AuthError } from './auth.errors.js';
import type { AuthRequest } from './auth.request.js';

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<AuthRequest>().headers.origin;
    if (typeof origin !== 'string' || !authOrigins(process.env.NODE_ENV).includes(origin)) {
      throw new AuthError(403, 'ORIGIN_REJECTED', 'Request origin is not allowed.');
    }
    return true;
  }
}
