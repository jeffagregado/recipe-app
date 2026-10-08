import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { validateDatabaseUrl } from './src/config/environment.js';

// pnpm workspace scripts run from apps/api; existing runtime variables take precedence.
const environment = config({ path: '.env', quiet: true });
// Missing files are valid with runtime-only settings; other file errors must surface.
if (environment.error && !('code' in environment.error && environment.error.code === 'ENOENT')) {
  throw new Error('Cannot load API environment configuration for Drizzle. Check file access.', { cause: environment.error });
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: validateDatabaseUrl(process.env.DATABASE_URL) },
});
