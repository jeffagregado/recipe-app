import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDevDatabaseUrl } from './neon-dev.js';

const PROJECT = 'round-term-82774312';
const DEV = 'br-hidden-waterfall-b3dj0mm5';
const WORKTREE = 'br-unit-worktree-00000000';
const dev = { id: DEV, name: 'dev', project_id: PROJECT };
const worktree = { id: WORKTREE, name: 'wt/feat/unit', project_id: PROJECT, parent_id: DEV };

// Placeholder values only; nothing here reaches a real service. The host names the branch the connection was requested for.
const connectionFor = (branch: string) => `postgresql://neondb_owner:unit-pw@${branch}.db.example.invalid/neondb?sslmode=verify-full`;

/** Stands in for the Neon CLI: answers branch lookups by id or name and hands out a connection per branch. */
function fakeNeon(branches: object[], connection: (branch: string) => string = connectionFor) {
  return async (args: string[]): Promise<string> => {
    if (args[0] === 'branches' && args[1] === 'get') {
      const found = branches.find((branch) => ('id' in branch && branch.id === args[2]) || ('name' in branch && branch.name === args[2]));
      if (!found) throw new Error('Neon dev target lookup failed.');
      return JSON.stringify(found);
    }
    if (args[0] === 'connection-string') return connection(args[1] ?? '');
    throw new Error(`Unexpected Neon CLI call: ${args[0]}`);
  };
}

/** A CLI that fails the test if credentials are ever requested: a refused target must stop before that. */
const refusingNeon = (branches: object[]) => fakeNeon(branches, () => { throw new Error('A connection was requested for a refused target.'); });

const directories: string[] = [];
/** A checkout root with an optional `.neon` file, plus a nested directory standing in for apps/api/test. */
function checkout(pin?: string | object): { root: string; nested: string } {
  const root = mkdtempSync(join(tmpdir(), 'neon-dev-'));
  directories.push(root);
  const nested = join(root, 'apps', 'api', 'test');
  mkdirSync(nested, { recursive: true });
  if (pin !== undefined) writeFileSync(join(root, '.neon'), typeof pin === 'string' ? pin : JSON.stringify(pin));
  return { root, nested };
}
const hostOf = (connection: string) => new URL(connection).hostname;
const local = (startDir: string, neon: (args: string[]) => Promise<string>) => getDevDatabaseUrl({ env: {}, startDir, neon });

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('local target selection', () => {
  it('targets dev when no .neon file is found', async () => {
    const { nested } = checkout();
    expect(hostOf(await local(nested, fakeNeon([dev, worktree])))).toBe(`${DEV}.db.example.invalid`);
  });

  it.each([
    ['the dev branch by name', { projectId: PROJECT, branch: 'dev' }],
    ['the dev branch by id', { projectId: PROJECT, branch: DEV }],
    ['a project without a branch', { projectId: PROJECT }],
  ])('targets dev when .neon pins %s', async (_label, pin) => {
    const { nested } = checkout(pin);
    expect(hostOf(await local(nested, fakeNeon([dev, worktree])))).toBe(`${DEV}.db.example.invalid`);
  });

  it.each([
    ['name', worktree.name],
    ['id', WORKTREE],
  ])('targets the pinned child of dev when .neon pins it by %s', async (_label, branch) => {
    const { nested } = checkout({ projectId: PROJECT, branch });
    expect(hostOf(await local(nested, fakeNeon([dev, worktree])))).toBe(`${WORKTREE}.db.example.invalid`);
  });

  it('reads a branch pinned under the legacy branchId key', async () => {
    const { nested } = checkout({ projectId: PROJECT, branchId: WORKTREE });
    expect(hostOf(await local(nested, fakeNeon([dev, worktree])))).toBe(`${WORKTREE}.db.example.invalid`);
  });

  it('prefers the nearest .neon file over one further up', async () => {
    const { root, nested } = checkout({ projectId: PROJECT, branch: 'dev' });
    writeFileSync(join(root, 'apps', '.neon'), JSON.stringify({ projectId: PROJECT, branch: worktree.name }));
    expect(hostOf(await local(nested, fakeNeon([dev, worktree])))).toBe(`${WORKTREE}.db.example.invalid`);
  });
});

describe('local target refusal', () => {
  const sibling = { id: 'br-unit-sibling-00000000', name: 'wt/feat/sibling', project_id: PROJECT, parent_id: WORKTREE };
  it.each([
    ['is in another project', { projectId: 'other-project-00000000', branch: worktree.name }, [dev, worktree]],
    ['names no project', { branch: worktree.name }, [dev, worktree]],
    ['resolves to a branch of another project', { projectId: PROJECT, branch: worktree.name }, [dev, { ...worktree, project_id: 'other-project-00000000' }]],
    ['resolves to a branch whose parent is not dev', { projectId: PROJECT, branch: sibling.name }, [dev, worktree, sibling]],
    ['resolves to a root branch', { projectId: PROJECT, branch: 'production' }, [dev, { id: 'br-unit-production-0000', name: 'production', project_id: PROJECT }]],
    ['resolves to a branch without an id', { projectId: PROJECT, branch: worktree.name }, [dev, { ...worktree, id: undefined }]],
    ['is not a branch name', { projectId: PROJECT, branch: 42 }, [dev, worktree]],
    ['could be read as a CLI flag', { projectId: PROJECT, branch: '--help' }, [dev, worktree]],
  ])('refuses a pin that %s', async (_label, pin, branches) => {
    const { nested } = checkout(pin);
    await expect(local(nested, refusingNeon(branches))).rejects.toThrow(/^Neon target mismatch: .*No database writes allowed\.$/);
  });

  it.each([
    ['is not JSON', '{ "projectId": '],
    ['is not an object', '"dev"'],
  ])('refuses a .neon file that %s instead of falling back to dev', async (_label, content) => {
    const { nested } = checkout(content);
    await expect(local(nested, refusingNeon([dev, worktree]))).rejects.toThrow(/^Neon target mismatch: .*No database writes allowed\.$/);
  });

  it('refuses a dev lookup that returns another branch', async () => {
    const { nested } = checkout();
    await expect(local(nested, refusingNeon([{ ...dev, name: 'production' }]))).rejects.toThrow(/^Neon target mismatch: .*No database writes allowed\.$/);
  });
});

describe('connection rules', () => {
  const pooled = 'postgresql://neondb_owner:unit-pw@ep-unit-pooler.db.example.invalid/neondb?sslmode=verify-full';
  const rejected = [
    ['a pooled host', pooled],
    ['another database', 'postgresql://neondb_owner:unit-pw@ep-unit.db.example.invalid/postgres?sslmode=verify-full'],
    ['another role', 'postgresql://reader:unit-pw@ep-unit.db.example.invalid/neondb?sslmode=verify-full'],
    ['unverified TLS', 'postgresql://neondb_owner:unit-pw@ep-unit.db.example.invalid/neondb?sslmode=require'],
    ['a value that is not a URL', 'unit-pw'],
  ];

  it.each(rejected)('refuses %s on a pinned branch without revealing the connection', async (_label, connection) => {
    const { nested } = checkout({ projectId: PROJECT, branch: worktree.name });
    const failure: unknown = await local(nested, fakeNeon([dev, worktree], () => connection)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/^Neon dev connection mismatch/);
    expect((failure as Error).message).not.toContain('unit-pw');
  });

  it.each(rejected)('refuses %s on dev', async (_label, connection) => {
    const { nested } = checkout();
    await expect(local(nested, fakeNeon([dev], () => connection))).rejects.toThrow(/^Neon dev connection mismatch/);
  });
});

describe('CI target', () => {
  it('uses the workflow connection without consulting the CLI or a .neon pin', async () => {
    const { nested } = checkout({ projectId: 'other-project-00000000', branch: 'production' });
    const neon = async (): Promise<string> => { throw new Error('The CLI is not logged in on CI.'); };
    const connection = connectionFor('ci-branch');
    await expect(getDevDatabaseUrl({ env: { CI: 'true', DATABASE_URL: connection }, startDir: nested, neon })).resolves.toBe(connection);
  });

  it('refuses a pooled workflow connection', async () => {
    const { nested } = checkout();
    const connection = 'postgresql://neondb_owner:unit-pw@ep-unit-pooler.db.example.invalid/neondb?sslmode=verify-full';
    await expect(getDevDatabaseUrl({ env: { CI: 'true', DATABASE_URL: connection }, startDir: nested, neon: fakeNeon([dev]) })).rejects.toThrow(/^CI database mismatch/);
  });
});
