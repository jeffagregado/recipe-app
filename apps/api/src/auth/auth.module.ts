import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import { DatabaseModule, DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { MailModule } from '../mail/mail.module.js';
import { createAuth } from './auth.js';
import { GOOGLE_ENDPOINTS, googleEndpoints } from './auth.google.js';
import type { GoogleEndpoints } from './auth.google.js';
import { GoogleController } from './google.controller.js';
import { GoogleSignInService } from './google.service.js';
import { AUTH } from './auth.tokens.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthRateLimiter } from './auth.rate-limit.js';
import { SessionGuard } from './session.guard.js';
import { OriginGuard } from './origin.guard.js';
import { PasswordResetController } from './password-reset.controller.js';
import { PasswordResetService } from './password-reset.service.js';

export { AUTH } from './auth.tokens.js';

@Module({
  imports: [DatabaseModule, MailModule],
  controllers: [AuthController, GoogleController, PasswordResetController],
  providers: [{ provide: GOOGLE_ENDPOINTS, useValue: googleEndpoints }, {
    provide: AUTH,
    inject: [DRIZZLE_DB, ConfigService, GOOGLE_ENDPOINTS],
    useFactory: (db: DrizzleDb, config: ConfigService<Environment, true>, endpoints: GoogleEndpoints) => createAuth(db, {
      BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
      BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
      AUTH_TRUSTED_ORIGINS: config.get('AUTH_TRUSTED_ORIGINS', { infer: true }),
      GOOGLE_CLIENT_ID: config.get('GOOGLE_CLIENT_ID', { infer: true }),
      GOOGLE_CLIENT_SECRET: config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      GOOGLE_REDIRECT_URI: config.get('GOOGLE_REDIRECT_URI', { infer: true }),
    }, endpoints),
  }, AuthService, GoogleSignInService, PasswordResetService, AuthRateLimiter, SessionGuard, OriginGuard],
  exports: [AUTH, AuthService, SessionGuard, OriginGuard, AuthRateLimiter, PasswordResetService, GoogleSignInService],
})
export class AuthModule {}
