import type { ServerResponse } from 'node:http';
import { Body, Controller, HttpCode, Post, Put, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { changePasswordSchema, disconnectGoogleSchema, googleStartSchema, requestSetPasswordSchema, updateDisplayNameSchema } from '@recipe-app/contracts/schemas';
import type { AuthUserResponse, GoogleStartResponse } from '@recipe-app/contracts/types';
import { GoogleSignInService } from '../auth/google.service.js';
import { unauthenticated } from '../auth/auth.errors.js';
import { AuthFilter } from '../auth/auth.filter.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import { clientAddress, trustedOrigin } from '../auth/auth.request.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { validateAuth } from '../auth/auth.validation.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AccountService } from './account.service.js';

export const DISPLAY_NAME_WRITE_LIMIT = 20;
const DISPLAY_NAME_WRITE_WINDOW_MS = 10 * 60_000;
/** Connect starts and disconnects share one window per Account, sized like the Display name card's. */
export const SIGN_IN_METHOD_WRITE_LIMIT = { limit: DISPLAY_NAME_WRITE_LIMIT, windowMs: DISPLAY_NAME_WRITE_WINDOW_MS };
const signInMethodWrites = (userId: string) => rateLimitKey('sign-in-methods:user', userId);
/** The login limit per email, here per Account: the current-password check must not become a way to guess it. */
const CHANGE_PASSWORD_LIMIT = { limit: 10, windowMs: 900_000 };
/** Per client address, beside the three an hour per target address that the service shares with forgot-password. */
const SET_PASSWORD_ADDRESS_LIMIT = { limit: 10, windowMs: 3_600_000 };

/** Settings wrappers for the signed-in Account. Native Better Auth routes stay closed (`mountAuth`). */
@Controller('account')
@UseGuards(OriginGuard, SessionGuard)
@UseFilters(AuthFilter)
export class AccountController {
  constructor(private readonly account: AccountService, private readonly limiter: AuthRateLimiter, private readonly google: GoogleSignInService) {}

  @Put('display-name')
  async updateDisplayName(@Body() body: unknown, @Req() request: AuthRequest): Promise<AuthUserResponse> {
    if (!request.user) throw unauthenticated();
    // Generous for a person correcting a typo; bounds scripted saves per Account.
    await this.limiter.consume(rateLimitKey('display-name:user', request.user.id), { limit: DISPLAY_NAME_WRITE_LIMIT, windowMs: DISPLAY_NAME_WRITE_WINDOW_MS });
    const input = validateAuth(updateDisplayNameSchema, body);
    return { user: await this.account.updateDisplayName(request.user.id, input) };
  }

  @Put('password')
  @HttpCode(204)
  async changePassword(@Body() body: unknown, @Req() request: AuthRequest): Promise<void> {
    if (!request.user || !request.sessionId) throw unauthenticated();
    // Counted before the body is read, so a malformed guess is still a guess.
    await this.limiter.consume(rateLimitKey('change-password:user', request.user.id), CHANGE_PASSWORD_LIMIT);
    const input = validateAuth(changePasswordSchema, body);
    await this.account.changePassword(request.user.id, request.sessionId, input);
  }

  @Post('password/set-link')
  @HttpCode(204)
  async requestSetPassword(@Body() body: unknown, @Req() request: AuthRequest): Promise<void> {
    if (!request.user) throw unauthenticated();
    await this.limiter.consume(rateLimitKey('set-password:address', clientAddress(request)), SET_PASSWORD_ADDRESS_LIMIT);
    validateAuth(requestSetPasswordSchema, body);
    await this.account.requestSetPassword(request.user.id, trustedOrigin(request));
  }

  /**
   * Answers the provider URL and the state cookie for a flow that attaches Google to the signed-in Account. The shared
   * callback wrapper (`POST /auth/google/callback`) completes it, and only for the session that asked here.
   */
  @Post('google/connect')
  @HttpCode(200)
  async connectGoogle(@Body() body: unknown, @Req() request: AuthRequest, @Res({ passthrough: true }) response: ServerResponse): Promise<GoogleStartResponse> {
    if (!request.user || !request.sessionId) throw unauthenticated();
    await this.limiter.consume(signInMethodWrites(request.user.id), SIGN_IN_METHOD_WRITE_LIMIT);
    validateAuth(googleStartSchema, body);
    const { url, cookie } = await this.google.startConnect(request, request.user.id, request.sessionId);
    response.setHeader('Set-Cookie', cookie);
    return { url };
  }

  @Post('google/disconnect')
  @HttpCode(204)
  async disconnectGoogle(@Body() body: unknown, @Req() request: AuthRequest): Promise<void> {
    if (!request.user) throw unauthenticated();
    await this.limiter.consume(signInMethodWrites(request.user.id), SIGN_IN_METHOD_WRITE_LIMIT);
    validateAuth(disconnectGoogleSchema, body);
    await this.account.disconnectGoogle(request.user.id);
  }
}
