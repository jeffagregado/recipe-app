import { Body, Controller, HttpCode, Post, Req, UseFilters, UseGuards } from '@nestjs/common';
import { forgotPasswordSchema, resetPasswordSchema } from '@recipe-app/contracts/schemas';
import { AuthError } from './auth.errors.js';
import { AuthFilter } from './auth.filter.js';
import { RESET_LINKS_PER_EMAIL } from './auth.reset.js';
import { AuthRateLimiter, rateLimitKey } from './auth.rate-limit.js';
import { clientAddress, trustedOrigin } from './auth.request.js';
import type { AuthRequest } from './auth.request.js';
import { validateAuth } from './auth.validation.js';
import { OriginGuard } from './origin.guard.js';
import { PasswordResetService } from './password-reset.service.js';

const HOUR_MS = 3_600_000;

@Controller('auth')
@UseFilters(AuthFilter)
export class PasswordResetController {
  constructor(private readonly reset: PasswordResetService, private readonly limiter: AuthRateLimiter) {}

  /** Answers 204 whether or not the address has an Account, so the response never says which. */
  @Post('forgot-password')
  @HttpCode(204)
  @UseGuards(OriginGuard)
  async forgotPassword(@Body() body: unknown, @Req() request: AuthRequest): Promise<void> {
    const input = validateAuth(forgotPasswordSchema, body);
    await this.limiter.consume(rateLimitKey('forgot:address', clientAddress(request)), { limit: 10, windowMs: HOUR_MS });
    if (await this.withinEmailLimit(input.email)) await this.reset.requestReset(input.email, trustedOrigin(request));
  }

  /** The token is consumed only here, by the submitted form: opening the emailed link calls nothing on the API. */
  @Post('reset-password')
  @HttpCode(204)
  @UseGuards(OriginGuard)
  async resetPassword(@Body() body: unknown, @Req() request: AuthRequest): Promise<void> {
    const input = validateAuth(resetPasswordSchema, body);
    await this.limiter.consume(rateLimitKey('reset:address', clientAddress(request)), { limit: 30, windowMs: HOUR_MS });
    await this.reset.resetPassword(input.token, input.password);
  }

  /**
   * Three an hour per target address. Past it the request is dropped without a different answer: a 429 here would let a
   * caller lock a person out of recovery and see it happen.
   */
  private async withinEmailLimit(email: string): Promise<boolean> {
    try {
      const { scope, ...limit } = RESET_LINKS_PER_EMAIL;
      await this.limiter.consume(rateLimitKey(scope, email), limit);
      return true;
    } catch (error) {
      if (error instanceof AuthError && error.getStatus() === 429) return false;
      throw error;
    }
  }
}
