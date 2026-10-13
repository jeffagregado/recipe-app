import type { ServerResponse } from 'node:http';
import { Body, Controller, HttpCode, Post, Put, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { cancelEmailChangeSchema, changeEmailSchema, changePasswordSchema, confirmEmailChangeSchema, disconnectGoogleSchema, googleStartSchema, requestSetPasswordSchema, resendEmailChangeSchema, updateDisplayNameSchema } from '@recipe-app/contracts/schemas';
import type { AuthUserResponse, ConfirmEmailChangeResponse, GoogleStartResponse } from '@recipe-app/contracts/types';
import { GoogleSignInService } from '../auth/google.service.js';
import { AuthError, unauthenticated } from '../auth/auth.errors.js';
import { AuthFilter } from '../auth/auth.filter.js';
import { AuthRateLimiter, rateLimitKey } from '../auth/auth.rate-limit.js';
import { clientAddress, trustedOrigin } from '../auth/auth.request.js';
import type { AuthRequest } from '../auth/auth.request.js';
import { AuthService } from '../auth/auth.service.js';
import { validateAuth } from '../auth/auth.validation.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AccountService } from './account.service.js';
import type { LinkCaller } from './account.service.js';

export const DISPLAY_NAME_WRITE_LIMIT = 20;
const DISPLAY_NAME_WRITE_WINDOW_MS = 10 * 60_000;
/** Connect starts and disconnects share one window per Account, sized like the Display name card's. */
export const SIGN_IN_METHOD_WRITE_LIMIT = { limit: DISPLAY_NAME_WRITE_LIMIT, windowMs: DISPLAY_NAME_WRITE_WINDOW_MS };
const signInMethodWrites = (userId: string) => rateLimitKey('sign-in-methods:user', userId);
/**
 * The login limit per email, here per Account: the current-password check must not become a way to guess it. The
 * Password and Email cards count on one key, so together they allow no more guesses than either alone.
 */
const CURRENT_PASSWORD_LIMIT = { scope: 'change-password:user', limit: 10, windowMs: 900_000 } as const;
/** Starting a change or resending its link, per client address, beside the three an hour per target address the service counts. */
const EMAIL_CHANGE_ADDRESS_LIMIT = { scope: 'email-change:address', limit: 10, windowMs: 3_600_000 } as const;
/** Per client address, like the reset link's: the endpoint has no session to count against. */
const EMAIL_CHANGE_CONFIRM_LIMIT = { limit: 30, windowMs: 3_600_000 };
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
    await this.countPasswordGuess(request.user.id);
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

  /** Answers the public user with its pending address. The Account's email is unchanged until the mailed link is confirmed. */
  @Post('email-change')
  @HttpCode(200)
  async changeEmail(@Body() body: unknown, @Req() request: AuthRequest): Promise<AuthUserResponse> {
    if (!request.user) throw unauthenticated();
    await this.countPasswordGuess(request.user.id);
    await this.countEmailChangeRequest(request);
    const input = validateAuth(changeEmailSchema, body);
    return { user: await this.account.requestEmailChange(request.user.id, input, trustedOrigin(request)) };
  }

  /** No password here: the link can only go to the address the password already approved. */
  @Post('email-change/resend')
  @HttpCode(204)
  async resendEmailChange(@Body() body: unknown, @Req() request: AuthRequest): Promise<void> {
    if (!request.user) throw unauthenticated();
    await this.countEmailChangeRequest(request);
    validateAuth(resendEmailChangeSchema, body);
    await this.account.resendEmailChange(request.user.id, trustedOrigin(request));
  }

  @Post('email-change/cancel')
  @HttpCode(200)
  async cancelEmailChange(@Body() body: unknown, @Req() request: AuthRequest): Promise<AuthUserResponse> {
    if (!request.user) throw unauthenticated();
    validateAuth(cancelEmailChangeSchema, body);
    return { user: await this.account.cancelEmailChange(request.user.id) };
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

  private async countEmailChangeRequest(request: AuthRequest): Promise<void> {
    const { scope, ...limit } = EMAIL_CHANGE_ADDRESS_LIMIT;
    await this.limiter.consume(rateLimitKey(scope, clientAddress(request)), limit);
  }

  /** Counted before the body is read, so a malformed guess is still a guess. */
  private async countPasswordGuess(userId: string): Promise<void> {
    const { scope, ...limit } = CURRENT_PASSWORD_LIMIT;
    await this.limiter.consume(rateLimitKey(scope, userId), limit);
  }
}

/**
 * The one settings endpoint without a session: the page behind the emailed link posts the token, which is the proof, and
 * the person may be signed out or in another browser. It has its own class so the session guard on `AccountController`
 * keeps covering every method added there. Only that page's POST consumes the token; opening the link calls nothing here.
 */
@Controller('account')
@UseGuards(OriginGuard)
@UseFilters(AuthFilter)
export class EmailChangeLinkController {
  constructor(private readonly account: AccountService, private readonly auth: AuthService, private readonly limiter: AuthRateLimiter) {}

  @Post('email-change/confirm')
  @HttpCode(200)
  async confirmEmailChange(@Body() body: unknown, @Req() request: AuthRequest): Promise<ConfirmEmailChangeResponse> {
    await this.limiter.consume(rateLimitKey('email-change-confirm:address', clientAddress(request)), EMAIL_CHANGE_CONFIRM_LIMIT);
    const input = validateAuth(confirmEmailChangeSchema, body);
    return this.account.confirmEmailChange(input.token, await this.caller(request));
  }

  /** Whose session the request carries, if any, so that session can be the one kept. Being signed out is not an error here. */
  private async caller(request: AuthRequest): Promise<LinkCaller | undefined> {
    try {
      const { user, sessionId } = await this.auth.identify(request, 'confirm-email-change-session');
      return { userId: user.id, sessionId };
    } catch (error) {
      if (error instanceof AuthError && error.getStatus() === 401) return undefined;
      throw error;
    }
  }
}
