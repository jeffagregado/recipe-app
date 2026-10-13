import type { ServerResponse } from 'node:http';
import { Body, Controller, Get, HttpCode, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { loginSchema, logoutSchema, signupSchema } from '@recipe-app/contracts/schemas';
import { AuthService } from './auth.service.js';
import { AuthRateLimiter, rateLimitKey } from './auth.rate-limit.js';
import { clientAddress } from './auth.request.js';
import type { AuthRequest } from './auth.request.js';
import { OriginGuard } from './origin.guard.js';
import { AuthFilter } from './auth.filter.js';
import { validateAuth } from './auth.validation.js';

@Controller('auth')
@UseFilters(AuthFilter)
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly limiter: AuthRateLimiter) {}

  @Post('signup')
  @UseGuards(OriginGuard)
  async signup(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse) {
    const input = validateAuth(signupSchema, body);
    await this.limiter.consume(rateLimitKey('signup:address', clientAddress(request)), { limit: 5, windowMs: 3_600_000 });
    const result = await this.auth.signup(input, request);
    response.setHeader('Set-Cookie', result.cookie);
    return { user: result.user };
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
