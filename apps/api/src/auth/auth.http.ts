import type { NestExpressApplication } from '@nestjs/platform-express';
import { toNodeHandler } from 'better-auth/node';
import { AUTH } from './auth.module.js';
import { authOrigins } from './auth.js';
import type { RecipeAuth } from './auth.js';

/** Register native auth before body parsing; other Nest routes retain JSON parsing. */
export function mountAuth(app: NestExpressApplication): void {
  app.enableCors({ origin: authOrigins(process.env.NODE_ENV), credentials: true });
  app.getHttpAdapter().getInstance().all('/api/auth/{*path}', toNodeHandler(app.get<RecipeAuth>(AUTH)));
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });
}
