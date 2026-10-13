import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { AuthRequest } from './auth.request.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const { user, sessionId } = await this.auth.identify(request, 'session-guard');
    request.user = user;
    request.sessionId = sessionId;
    return true;
  }
}
