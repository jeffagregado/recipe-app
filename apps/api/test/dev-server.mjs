import { getDevDatabaseUrl } from './neon-dev.ts';

// Resolve and verify the approved target before starting the compiled API.
try {
  process.env.DATABASE_URL = await getDevDatabaseUrl();
  process.env.NODE_ENV = 'development';
  process.env.PORT ||= '4101';
  await import('../dist/main.js');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Dev verification server failed.');
  process.exitCode = 1;
}
