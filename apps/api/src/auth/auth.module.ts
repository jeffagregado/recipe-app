import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import { DatabaseModule, DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { MailModule } from '../mail/mail.module.js';
import { createAuth } from './auth.js';
import { AUTH } from './auth.tokens.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthRateLimiter } from './auth.rate-limit.js';
import { SessionGuard } from './session.guard.js';
import { OriginGuard } from './origin.guard.js';

export { AUTH } from './auth.tokens.js';

@Module({
  imports: [DatabaseModule, MailModule],
  controllers: [AuthController],
  providers: [{
    provide: AUTH,
    inject: [DRIZZLE_DB, ConfigService],
    useFactory: (db: DrizzleDb, config: ConfigService<Environment, true>) => createAuth(db, {
      BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
      BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
      AUTH_TRUSTED_ORIGINS: config.get('AUTH_TRUSTED_ORIGINS', { infer: true }),
    }),
  }, AuthService, AuthRateLimiter, SessionGuard, OriginGuard],
  exports: [AUTH, AuthService, SessionGuard, OriginGuard, AuthRateLimiter],
})
export class AuthModule {}
