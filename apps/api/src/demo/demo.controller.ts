import type { ServerResponse } from 'node:http';
import { Controller, HttpCode, Post, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import type { DemoStartResponse } from '@recipe-app/contracts/types';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import { clientAddress } from '../auth/auth.request.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { DemoFilter } from './demo-errors.js';
import { DemoStartService } from './demo-start.service.js';

/** Starts from one client address in an hour. */
export const DEMO_STARTS_PER_HOUR = 5;
const HOUR_MS = 3_600_000;

@Controller('demo')
@UseFilters(DemoFilter)
export class DemoController {
  constructor(private readonly demo: DemoStartService, private readonly limiter: AuthRateLimiter) {}

  /** Answers the new Demo account and sets its session cookie; the body is ignored. */
  @Post('start')
  @HttpCode(201)
  @UseGuards(OriginGuard)
  async start(@Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse): Promise<DemoStartResponse> {
    await this.limiter.consume(rateLimitKey('demo-start:address', clientAddress(request)), { limit: DEMO_STARTS_PER_HOUR, windowMs: HOUR_MS });
    const { cookie, ...started } = await this.demo.start(request);
    response.setHeader('Set-Cookie', cookie);
    return started;
  }
}
