import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

type AuthHarness = typeof import('../apps/api/test/auth-harness.js');
type StorageCleanup = typeof import('../apps/api/test/storage-cleanup.js');

/** Playwright uses standard decorators; compile the real helper against Nest's built legacy-decorator modules. */
async function loadApiTestModule(name: string): Promise<unknown> {
  const apiRoot = resolve('apps/api');
  const requireApi = createRequire(resolve(apiRoot, 'package.json'));
  const source = await readFile(resolve(apiRoot, `test/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
  const moduleText = compiled.replace(/from ['"]([^'"]+)['"]/g, (statement, specifier: string) => {
    if (specifier.startsWith('node:')) return statement;
    let target: string;
    if (specifier.startsWith('../src/')) target = resolve(apiRoot, 'dist', specifier.slice('../src/'.length));
    else if (specifier === './neon-dev.js') target = resolve(apiRoot, 'test/neon-dev.ts');
    else target = requireApi.resolve(specifier);
    if (specifier === 'drizzle-orm') target = target.replace(/\.cjs$/, '.js');
    return `from '${pathToFileURL(target).href}'`;
  });
  const output = resolve(`e2e/.generated/${name}-${process.pid}.mjs`);
  await mkdir(resolve('e2e/.generated'), { recursive: true });
  await writeFile(output, moduleText);
  return await import(pathToFileURL(output).href);
}

export const loadAuthHarness = () => loadApiTestModule('auth-harness') as Promise<AuthHarness>;
export const loadStorageCleanup = () => loadApiTestModule('storage-cleanup') as Promise<StorageCleanup>;
