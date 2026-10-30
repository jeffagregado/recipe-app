import type { RequestListener } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Environment } from './config/environment.js';
import { DatabaseError, DatabaseService } from './database/database.service.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mountAuth } from './auth/auth.http.js';

/** Vercel imports this module and serves requests through its default export, so the app must not listen there. */
const onVercel = process.env.VERCEL === '1';

async function bootstrap(): Promise<RequestListener> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { abortOnError: false, bodyParser: false });
  mountAuth(app);
  const logger = new Logger('Bootstrap');
  app.enableShutdownHooks();
  app.get(DatabaseService).onPoolError = (error) => {
    logger.error(error.message);
    void app.close().catch((cause: unknown) => {
      const shutdownError = new DatabaseError('API shutdown after a database pool error failed.', { cause });
      logger.error(shutdownError.message);
    }).finally(() => {
      process.exitCode = 1;
      // A Vercel instance outlives a closed server, so exit for the platform to replace it, as Render restarts the service.
      if (onVercel) process.exit();
    });
  };
  try {
    if (onVercel) {
      await app.init();
    } else {
      const config = app.get<ConfigService<Environment, true>>(ConfigService);
      await app.listen(config.get('PORT', { infer: true }));
    }
  } catch (error) {
    try {
      await app.close();
    } catch (cause) {
      throw new DatabaseError('API startup and cleanup failed. Check database connectivity and shutdown.', { cause: new AggregateError([error, cause]) });
    }
    throw error;
  }
  return app.getHttpAdapter().getInstance();
}

let handler: RequestListener | undefined;
// Causes remain attached to service errors; never print credentials or signed URLs.
try {
  handler = await bootstrap();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'API startup failed.');
  process.exitCode = 1;
  // Without a handler nothing serves requests, so fail the Vercel function's start instead of exporting none.
  if (onVercel) throw new Error('API startup failed.');
}

/** The request handler Vercel's NestJS support calls; Render and local runs listen on PORT instead. */
export default handler;
