import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import { AuthError } from './auth.errors.js';
import type { AuthRequest } from './auth.request.js';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const origin = context.switchToHttp().getRequest<AuthRequest>().headers.origin;
    if (typeof origin !== 'string' || !this.config.get('AUTH_TRUSTED_ORIGINS', { infer: true }).includes(origin)) {
      throw new AuthError(403, 'ORIGIN_REJECTED', 'Request origin is not allowed.');
    }
    return true;
  }
}
