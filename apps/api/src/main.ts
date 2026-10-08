import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Environment } from './config/environment.js';
import { DatabaseError, DatabaseService } from './database/database.service.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  const logger = new Logger('Bootstrap');
  app.enableShutdownHooks();
  app.get(DatabaseService).onPoolError = (error) => {
    logger.error(error.message);
    void app.close().catch((cause: unknown) => {
      const shutdownError = new DatabaseError('API shutdown after a database pool error failed.', { cause });
      logger.error(shutdownError.message);
    }).finally(() => { process.exitCode = 1; });
  };
  try {
    const config = app.get<ConfigService<Environment, true>>(ConfigService);
    await app.listen(config.get('PORT', { infer: true }));
  } catch (error) {
    try {
      await app.close();
    } catch (cause) {
      throw new DatabaseError('API startup and cleanup failed. Check database connectivity and shutdown.', { cause: new AggregateError([error, cause]) });
    }
    throw error;
  }
}
// Causes remain attached to service errors; never print credentials or signed URLs.
try {
  await bootstrap();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'API startup failed.');
  process.exitCode = 1;
}
