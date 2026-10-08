import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseService } from './database.service.js';
import type { DrizzleDb } from './database.service.js';

export const DRIZZLE_DB = Symbol('DRIZZLE_DB');

@Module({
  imports: [ConfigModule],
  providers: [
    DatabaseService,
    {
      provide: DRIZZLE_DB,
      inject: [DatabaseService],
      useFactory: (database: DatabaseService): DrizzleDb => database.db,
    },
  ],
  exports: [DRIZZLE_DB, DatabaseService],
})
export class DatabaseModule {}
