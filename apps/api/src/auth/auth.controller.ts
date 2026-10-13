import type { ServerResponse } from 'node:http';
import { Body, Controller, Get, HttpCode, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { loginSchema, logoutSchema, resendVerificationSchema, signupSchema, verifyEmailSchema } from '@recipe-app/contracts/schemas';
import type { SignupResponse } from '@recipe-app/contracts/types';
import { AuthService } from './auth.service.js';
import { AuthRateLimiter, rateLimitKey } from './auth.rate-limit.js';
import { clientAddress, trustedOrigin } from './auth.request.js';
import type { AuthRequest } from './auth.request.js';
import { OriginGuard } from './origin.guard.js';
import { AuthFilter } from './auth.filter.js';
import { validateAuth } from './auth.validation.js';

const HOUR_MS = 3_600_000;

@Controller('auth')
@UseFilters(AuthFilter)
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly limiter: AuthRateLimiter) {}

  @Post('signup')
  @UseGuards(OriginGuard)
  async signup(@Body() body: unknown, @Req() request: AuthRequest): Promise<SignupResponse> {
    const input = validateAuth(signupSchema, body);
    await this.limiter.consume(rateLimitKey('signup:address', clientAddress(request)), { limit: 5, windowMs: HOUR_MS });
    await this.auth.signup(input, request, trustedOrigin(request));
    return { verificationRequired: true };
  }

  /** Answers 204 whether or not the address has an Account, so the response never says which. */
  @Post('resend-verification')
  @HttpCode(204)
  @UseGuards(OriginGuard)
  async resendVerification(@Body() body: unknown, @Req() request: AuthRequest): Promise<void> {
    const input = validateAuth(resendVerificationSchema, body);
    await this.limiter.consume(rateLimitKey('resend:address', clientAddress(request)), { limit: 10, windowMs: HOUR_MS });
    await this.limiter.consume(rateLimitKey('resend:email', input.email), { limit: 3, windowMs: HOUR_MS });
    await this.auth.resendVerification(input.email, trustedOrigin(request));
  }

  /** No origin check: the link is opened from a mail client, and the token itself is the proof. */
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@Body() body: unknown, @Req() request: AuthRequest): Promise<void> {
    const input = validateAuth(verifyEmailSchema, body);
    await this.limiter.consume(rateLimitKey('verify:address', clientAddress(request)), { limit: 30, windowMs: HOUR_MS });
    await this.auth.verifyEmail(input.token);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(OriginGuard)
  async login(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse) {
    const input = validateAuth(loginSchema, body);
    await this.limiter.consume(rateLimitKey('login:address', clientAddress(request)), { limit: 50, windowMs: 900_000 });
    await this.limiter.consume(rateLimitKey('login:email', input.email), { limit: 10, windowMs: 900_000 });
    const result = await this.auth.login(input, request);
    response.setHeader('Set-Cookie', result.cookie);
    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(OriginGuard)
  async logout(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse): Promise<void> {
    validateAuth(logoutSchema, body);
    response.setHeader('Set-Cookie', await this.auth.logout(request));
  }

  @Get('session')
  session(@Req() request: AuthRequest) { return this.auth.session(request); }
}
