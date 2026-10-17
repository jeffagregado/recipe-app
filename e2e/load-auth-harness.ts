import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

type AuthHarness = typeof import('../apps/api/test/auth-harness.js');
type StorageCleanup = typeof import('../apps/api/test/storage-cleanup.js');
type DemoTemplateStorage = typeof import('../apps/api/test/demo-template-storage.js');

const compiledModules = new Map<string, Promise<string>>();

function compileApiTestModule(name: string): Promise<string> {
  let output = compiledModules.get(name);
  if (!output) { output = compile(name); compiledModules.set(name, output); }
  return output;
}

/**
 * Playwright uses standard decorators; compile the real helper against Nest's built legacy-decorator modules. A helper's
 * own `./` imports are compiled the same way, once each.
 */
async function compile(name: string): Promise<string> {
  const apiRoot = resolve('apps/api');
  const requireApi = createRequire(resolve(apiRoot, 'package.json'));
  const source = await readFile(resolve(apiRoot, `test/${name}.ts`), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
  const pattern = /from ['"]([^'"]+)['"]/g;
  const targets = new Map<string, string>();
  for (const [, specifier] of compiled.matchAll(pattern)) {
    if (specifier.startsWith('node:') || targets.has(specifier)) continue;
    let target: string;
    if (specifier.startsWith('../src/')) target = resolve(apiRoot, 'dist', specifier.slice('../src/'.length));
    else if (specifier === './neon-dev.js') target = resolve(apiRoot, 'test/neon-dev.ts');
    else if (specifier.startsWith('./')) target = await compileApiTestModule(specifier.slice(2).replace(/\.js$/, ''));
    else target = requireApi.resolve(specifier);
    if (specifier === 'drizzle-orm') target = target.replace(/\.cjs$/, '.js');
    targets.set(specifier, pathToFileURL(target).href);
  }
  const moduleText = compiled.replace(pattern, (statement, specifier: string) => targets.has(specifier) ? `from '${targets.get(specifier)}'` : statement);
  const output = resolve(`e2e/.generated/${name}-${process.pid}.mjs`);
  await mkdir(resolve('e2e/.generated'), { recursive: true });
  await writeFile(output, moduleText);
  return output;
}

const loadApiTestModule = async (name: string): Promise<unknown> => import(pathToFileURL(await compileApiTestModule(name)).href);

export const loadAuthHarness = () => loadApiTestModule('auth-harness') as Promise<AuthHarness>;
export const loadStorageCleanup = () => loadApiTestModule('storage-cleanup') as Promise<StorageCleanup>;
export const loadDemoTemplate = () => loadApiTestModule('demo-template-storage') as Promise<DemoTemplateStorage>;
