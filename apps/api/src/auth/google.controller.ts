import type { ServerResponse } from 'node:http';
import { Body, Controller, HttpCode, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { googleCallbackSchema, googleStartSchema } from '@recipe-app/contracts/schemas';
import type { GoogleStartResponse } from '@recipe-app/contracts/types';
import { AuthFilter } from './auth.filter.js';
import { AuthRateLimiter, rateLimitKey } from './auth.rate-limit.js';
import { clientAddress } from './auth.request.js';
import type { AuthRequest } from './auth.request.js';
import { validateAuth } from './auth.validation.js';
import { GoogleSignInService } from './google.service.js';
import { OriginGuard } from './origin.guard.js';

const WINDOW_MS = 900_000;

@Controller('auth/google')
@UseFilters(AuthFilter)
export class GoogleController {
  constructor(private readonly google: GoogleSignInService, private readonly limiter: AuthRateLimiter) {}

  /** Answers the provider URL for the browser to follow and the state cookie the web copies onto its own origin. */
  @Post('start')
  @HttpCode(200)
  @UseGuards(OriginGuard)
  async start(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse): Promise<GoogleStartResponse> {
    validateAuth(googleStartSchema, body);
    await this.limiter.consume(rateLimitKey('google-start:address', clientAddress(request)), { limit: 20, windowMs: WINDOW_MS });
    const { url, cookie } = await this.google.start(request);
    response.setHeader('Set-Cookie', cookie);
    return { url };
  }

  /** No origin check: Google sends the browser here by a cross-site redirect, and the state with its cookie is the proof. */
  @Post('callback')
  @HttpCode(204)
  async callback(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse): Promise<void> {
    const input = validateAuth(googleCallbackSchema, body);
    await this.limiter.consume(rateLimitKey('google-callback:address', clientAddress(request)), { limit: 30, windowMs: WINDOW_MS });
    response.setHeader('Set-Cookie', await this.google.complete(input, request));
  }
}
