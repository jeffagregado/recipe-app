import { Body, Controller, Put, Req, UseFilters, UseGuards } from '@nestjs/common';
import { updateDisplayNameSchema } from '@recipe-app/contracts/schemas';
import type { AuthUserResponse } from '@recipe-app/contracts/types';
import { unauthenticated } from '../auth/auth.errors.js';
import { AuthFilter } from '../auth/auth.filter.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { validateAuth } from '../auth/auth.validation.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AccountService } from './account.service.js';

export const DISPLAY_NAME_WRITE_LIMIT = 20;
const DISPLAY_NAME_WRITE_WINDOW_MS = 10 * 60_000;

/** Settings wrappers for the signed-in Account. Native Better Auth routes stay closed (`mountAuth`). */
@Controller('account')
@UseGuards(OriginGuard, SessionGuard)
@UseFilters(AuthFilter)
export class AccountController {
  constructor(private readonly account: AccountService, private readonly limiter: AuthRateLimiter) {}

  @Put('display-name')
  async updateDisplayName(@Body() body: unknown, @Req() request: AuthRequest): Promise<AuthUserResponse> {
    if (!request.user) throw unauthenticated();
    // Generous for a person correcting a typo; bounds scripted saves per Account.
    await this.limiter.consume(rateLimitKey('display-name:user', request.user.id), { limit: DISPLAY_NAME_WRITE_LIMIT, windowMs: DISPLAY_NAME_WRITE_WINDOW_MS });
    const input = validateAuth(updateDisplayNameSchema, body);
    return { user: await this.account.updateDisplayName(input, request.user) };
  }
}
