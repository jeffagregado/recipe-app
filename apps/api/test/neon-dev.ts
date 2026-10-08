import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const cli = createRequire(import.meta.url).resolve('neon/cli');
const projectId = 'rapid-leaf-53002806';
const DEV_BRANCH = 'br-raspy-waterfall-b4necsu5';

async function neon(args: string[]): Promise<string> {
  try {
    const { stdout } = await execute(process.execPath, [cli, '--no-analytics', ...args], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch (cause) {
    // Child errors include stdout/command data. Keep causes attached, never display them.
    throw new Error('Neon dev target lookup failed. Check local CLI authentication and network access.', { cause });
  }
}

/** Resolve only the approved dev branch; credentials stay in process memory. */
export async function getDevDatabaseUrl(): Promise<string> {
  const target: unknown = JSON.parse(await neon(['branches', 'get', DEV_BRANCH, '--project-id', projectId, '--output', 'json']));
  const branch = Array.isArray(target) ? target[0] as unknown : target;
  if (!branch || typeof branch !== 'object' || !('id' in branch) || branch.id !== DEV_BRANCH || !('name' in branch) || branch.name !== 'recipe-app-dev') {
    throw new Error('Neon target mismatch: expected recipe-app-dev. No database writes allowed.');
  }
  const connection = await neon(['connection-string', DEV_BRANCH, '--project-id', projectId, '--database-name', 'neondb', '--role-name', 'neondb_owner', '--ssl', 'verify-full']);
  const url = new URL(connection);
  if (url.hostname.includes('-pooler') || url.pathname !== '/neondb' || decodeURIComponent(url.username) !== 'neondb_owner' || url.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error('Neon dev connection mismatch: require direct neondb owner connection with verified TLS.');
  }
  return connection;
}
