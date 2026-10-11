import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { unauthenticated } from '../auth/auth.errors.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import type { AuthRequest } from '../auth/auth.request.js';

export const CATEGORY_WRITE_LIMIT = 60;
const CATEGORY_WRITE_WINDOW_MS = 10 * 60_000;

/** Generous for editing a ten-row list; bounds scripted saves per account. */
@Injectable()
export class CategoryWriteGuard implements CanActivate {
  constructor(private readonly rateLimiter: AuthRateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user } = context.switchToHttp().getRequest<AuthRequest>();
    if (!user) throw unauthenticated();
    await this.rateLimiter.consume(rateLimitKey('category-write:user', user.id), { limit: CATEGORY_WRITE_LIMIT, windowMs: CATEGORY_WRITE_WINDOW_MS });
    return true;
  }
}
