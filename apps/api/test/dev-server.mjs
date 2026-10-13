import { getDevDatabaseUrl } from './neon-dev.ts';

// Resolve and verify the approved target before starting the compiled API.
try {
  process.env.DATABASE_URL = await getDevDatabaseUrl();
  process.env.NODE_ENV = 'development';
  // The Playwright web server runs at this origin; process environment overrides the env file.
  process.env.AUTH_TRUSTED_ORIGINS = 'http://127.0.0.1:4100';
  // E2E signs up Accounts through this server. A blank key selects the logging transport, so no run reaches Resend
  // even when the env file holds a key; the tests read each link from the verifications table.
  process.env.RESEND_API_KEY = '';
  process.env.PORT ||= '4101';
  await import('../dist/main.js');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Dev verification server failed.');
  process.exitCode = 1;
}
