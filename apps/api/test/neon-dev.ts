import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, parse, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const cli = createRequire(import.meta.url).resolve('neon/cli');
const projectId = 'round-term-82774312';
const DEV_BRANCH = 'br-hidden-waterfall-b3dj0mm5';
const REFUSED = 'No database writes allowed.';

type NeonCli = (args: string[]) => Promise<string>;

interface DevTargetOptions {
  /** Process environment; only the CI path reads it. */
  env?: NodeJS.ProcessEnv;
  /** Directory the `.neon` lookup starts from. Defaults to this file's directory, so a checkout always follows its own pin. */
  startDir?: string;
  /** Runs the Neon CLI and returns its trimmed stdout. */
  neon?: NeonCli;
}

async function neon(args: string[]): Promise<string> {
  try {
    const { stdout } = await execute(process.execPath, [cli, '--no-analytics', ...args], { timeout: 30_000, maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch (cause) {
    // Child errors include stdout/command data. Keep causes attached, never display them.
    throw new Error('Neon dev target lookup failed. Check local CLI authentication and network access.', { cause });
  }
}

function requireDirectVerifiedConnection(connection: string, mismatch: string): string {
  const url = URL.canParse(connection) ? new URL(connection) : undefined;
  if (!url || url.hostname.includes('-pooler') || url.pathname !== '/neondb' || decodeURIComponent(url.username) !== 'neondb_owner' || url.searchParams.get('sslmode') !== 'verify-full') {
    throw new Error(mismatch);
  }
  return connection;
}

/**
 * The branch pinned by the nearest `.neon` file, or undefined when the checkout pins nothing or pins dev.
 * Walks up like the Neon CLI does: stops at the home directory and the filesystem root without reading either.
 */
function pinnedBranch(startDir: string): string | undefined {
  const home = homedir();
  let file: string | undefined;
  for (let directory = resolve(startDir); directory !== home && directory !== parse(directory).root; directory = dirname(directory)) {
    if (existsSync(resolve(directory, '.neon'))) {
      file = resolve(directory, '.neon');
      break;
    }
  }
  if (!file) return undefined;
  let context: unknown;
  try {
    context = JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    // A worktree with a damaged pin must not fall back to the shared dev branch.
    throw new Error(`Neon target mismatch: the nearest .neon file cannot be read. ${REFUSED}`, { cause });
  }
  if (!context || typeof context !== 'object') throw new Error(`Neon target mismatch: the nearest .neon file is not a context object. ${REFUSED}`);
  const pin: unknown = 'branch' in context ? context.branch : 'branchId' in context ? context.branchId : undefined;
  if (pin === undefined || pin === 'dev' || pin === DEV_BRANCH) return undefined;
  // A leading dash would reach the CLI as a flag instead of a branch.
  if (typeof pin !== 'string' || !pin || pin.startsWith('-') || !('projectId' in context) || context.projectId !== projectId) {
    throw new Error(`Neon target mismatch: .neon must pin dev or a child of dev in recipe-app-v2. ${REFUSED}`);
  }
  return pin;
}

async function lookUpBranch(run: NeonCli, branch: string): Promise<object | undefined> {
  const target: unknown = JSON.parse(await run(['branches', 'get', branch, '--project-id', projectId, '--output', 'json']));
  const found = Array.isArray(target) ? target[0] as unknown : target;
  return found && typeof found === 'object' ? found : undefined;
}

/** Resolve only the approved dev branch, or the child of it this checkout pins; credentials stay in process memory. */
export async function getDevDatabaseUrl({ env = process.env, startDir = dirname(fileURLToPath(import.meta.url)), neon: run = neon }: DevTargetOptions = {}): Promise<string> {
  // CI has no Neon CLI login: the workflow creates a disposable child of the dev branch and passes its connection string.
  if (env.CI && env.DATABASE_URL) {
    return requireDirectVerifiedConnection(env.DATABASE_URL, 'CI database mismatch: DATABASE_URL must be a direct neondb owner connection with verified TLS.');
  }
  const pin = pinnedBranch(startDir);
  let target = DEV_BRANCH;
  if (pin) {
    // A worktree's own branch: accept it only as a direct child of dev, then address it by the id Neon reported.
    const branch = await lookUpBranch(run, pin);
    if (!branch || !('id' in branch) || typeof branch.id !== 'string' || !branch.id.startsWith('br-') || (branch.id !== pin && !('name' in branch && branch.name === pin))
      || !('project_id' in branch) || branch.project_id !== projectId || !('parent_id' in branch) || branch.parent_id !== DEV_BRANCH) {
      throw new Error(`Neon target mismatch: the branch pinned in .neon is not a child of the dev branch of recipe-app-v2. ${REFUSED}`);
    }
    target = branch.id;
  } else {
    const branch = await lookUpBranch(run, DEV_BRANCH);
    if (!branch || !('id' in branch) || branch.id !== DEV_BRANCH || !('name' in branch) || branch.name !== 'dev') {
      throw new Error(`Neon target mismatch: expected the dev branch of recipe-app-v2. ${REFUSED}`);
    }
  }
  const connection = await run(['connection-string', target, '--project-id', projectId, '--database-name', 'neondb', '--role-name', 'neondb_owner', '--ssl', 'verify-full']);
  return requireDirectVerifiedConnection(connection, 'Neon dev connection mismatch: require direct neondb owner connection with verified TLS.');
}
