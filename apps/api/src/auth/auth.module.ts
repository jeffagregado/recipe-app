import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment.js';
import { DatabaseModule, DRIZZLE_DB } from '../database/database.module.js';
import type { DrizzleDb } from '../database/database.service.js';
import { createAuth } from './auth.js';

export const AUTH = Symbol('AUTH');

@Module({
  imports: [DatabaseModule],
  providers: [{
    provide: AUTH,
    inject: [DRIZZLE_DB, ConfigService],
    useFactory: (db: DrizzleDb, config: ConfigService<Environment, true>) => createAuth(db, {
      BETTER_AUTH_SECRET: config.get('BETTER_AUTH_SECRET', { infer: true }),
      BETTER_AUTH_URL: config.get('BETTER_AUTH_URL', { infer: true }),
    }),
  }],
  exports: [AUTH],
})
export class AuthModule {}
