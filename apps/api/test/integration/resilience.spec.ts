import type { AddressInfo } from 'node:net';
import type { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ResilienceModule, ResilienceService } from '@nestjs/resilience';
import type { ResiliencePolicy } from '@nestjs/resilience';
import type { RecipeListQuery, RecipeListResponse } from '@recipe-app/contracts/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseError } from '../../src/database/database.service.js';
import { RecipesController } from '../../src/recipes/recipes.controller.js';
import { RecipesService } from '../../src/recipes/recipes.service.js';
import { recipeResiliencePresets } from '../../src/recipes/recipes.resilience.js';
import { SessionGuard } from '../../src/auth/session.guard.js';
import type { AuthRequest } from '../../src/auth/auth.request.js';

// Deterministic dependency faults exercise the real controller/interceptor over HTTP.
// Actual PostgreSQL deadlines and normal recipe reads are covered in paging.spec.ts.
class ControlledReader {
  readonly signals: AbortSignal[] = [];
  failure?: Error;
  private gate?: Promise<void>;
  release?: () => void;
  private readonly readPolicy: ResiliencePolicy;
  private readonly policy: ResiliencePolicy;

  constructor(resilience: ResilienceService) {
    this.readPolicy = resilience.preset('recipeRead');
    this.policy = resilience.preset('recipeDatabase');
  }

  hold(): void {
    this.gate = new Promise((resolve) => { this.release = resolve; });
  }

  findAll(query: RecipeListQuery, userId: string): Promise<RecipeListResponse> {
    if (userId !== 'controlled-owner') throw new Error('Session owner was not forwarded.');
    return this.readPolicy.execute(({ signal }) => {
      this.signals.push(signal);
      return this.policy.execute(async () => {
        await this.gate;
        signal.throwIfAborted();
        if (this.failure) throw this.failure;
        return { data: [], counts: { total: 0, favorites: 0, categories: [] },
          meta: { page: query.page, limit: query.limit, total: 0, totalPages: 0 } };
      }, { signal });
    });
  }
}

describe('Recipe resilience over HTTP', () => {
  const concurrency = recipeResiliencePresets.recipeRead.bulkhead.maxConcurrent;
  const queueSize = recipeResiliencePresets.recipeRead.bulkhead.maxQueue;
  let app: INestApplication;
  let baseUrl: string;
  let reader: ControlledReader;
  let resilience: ResilienceService;

  async function startApp(timeout = 800) {
    const module = await Test.createTestingModule({
      imports: [ResilienceModule.forRoot({ presets: {
        ...recipeResiliencePresets,
        recipeRead: { ...recipeResiliencePresets.recipeRead, timeout,
          bulkhead: { ...recipeResiliencePresets.recipeRead.bulkhead, queueTimeout: 200 } },
        recipeDatabase: { ...recipeResiliencePresets.recipeDatabase,
          circuitBreaker: { ...recipeResiliencePresets.recipeDatabase.circuitBreaker, openDuration: 200 } },
      } })],
      controllers: [RecipesController],
      providers: [{ provide: ControlledReader, inject: [ResilienceService],
        useFactory: (service: ResilienceService) => new ControlledReader(service) },
      { provide: RecipesService, useExisting: ControlledReader }],
    }).overrideGuard(SessionGuard).useValue({ canActivate: (context: ExecutionContext) => {
      context.switchToHttp().getRequest<AuthRequest>().user = { id: 'controlled-owner', displayName: 'Controlled owner' };
      return true;
    } }).compile();
    app = module.createNestApplication({ logger: false });
    reader = app.get(ControlledReader);
    resilience = app.get(ResilienceService);
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }

  beforeEach(async () => { await startApp(); });

  afterEach(async () => {
    reader?.release?.();
    await expect.poll(() => resilience.bulkhead('recipeRead').active).toBe(0);
    await app?.close();
  });

  it('preserves successful contracts and rejects invalid inputs before touching the dependency', async () => {
    const invalid = await fetch(`${baseUrl}/recipes?page=0`);
    expect(invalid.status).toBe(400);
    expect(reader.signals).toHaveLength(0);
    expect(resilience.circuitBreaker('recipeDatabase').stats.total).toBe(0);
    const valid = await fetch(`${baseUrl}/recipes?page=2`);
    expect(valid.status).toBe(200);
    expect(valid.headers.get('cache-control')).toBe('private, no-store');
    expect(await valid.json()).toMatchObject({ meta: { page: 2, limit: 20 }, data: [] });
  });

  it('allows healthy connection setup beyond the former four-second request limit', async () => {
    await app.close();
    await startApp(recipeResiliencePresets.recipeRead.timeout);
    reader.hold();
    const pending = fetch(`${baseUrl}/recipes`);
    await expect.poll(() => reader.signals.length).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 5_500));
    reader.release?.();
    const response = await pending;
    expect(response.status).toBe(200);
    expect(reader.signals[0].aborted).toBe(false);
  }, 8_000);

  it('rejects excess concurrency with 503 and drains its bounded queue', async () => {
    reader.hold();
    const active = Array.from({ length: concurrency }, () => fetch(`${baseUrl}/recipes`));
    await expect.poll(() => reader.signals.length).toBe(concurrency);
    const queued = Array.from({ length: queueSize }, () => fetch(`${baseUrl}/recipes`));
    await expect.poll(() => resilience.bulkhead('recipeRead').queued).toBe(queueSize);
    const rejected = await fetch(`${baseUrl}/recipes`);
    expect(rejected.status).toBe(503);
    expect(await rejected.json()).toMatchObject({ code: 'BULKHEAD_FULL' });
    reader.release?.();
    expect((await Promise.all([...active, ...queued])).map(({ status }) => status)).toEqual(Array.from({ length: concurrency + queueSize }, () => 200));
    expect(resilience.bulkhead('recipeRead').queued).toBe(0);
  });

  it('expires queued requests without starting more dependency work', async () => {
    reader.hold();
    const active = Array.from({ length: concurrency }, () => fetch(`${baseUrl}/recipes`));
    await expect.poll(() => reader.signals.length).toBe(concurrency);
    const queued = await fetch(`${baseUrl}/recipes`);
    expect(queued.status).toBe(503);
    expect(await queued.json()).toMatchObject({ code: 'BULKHEAD_FULL' });
    expect(reader.signals).toHaveLength(concurrency);
    reader.release?.();
    expect((await Promise.all(active)).map(({ status }) => status)).toEqual(Array.from({ length: concurrency }, () => 200));
  });

  it('returns 504, aborts timed-out work and holds the slot until that work actually settles', async () => {
    reader.hold();
    const response = await fetch(`${baseUrl}/recipes`);
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({ code: 'TIMEOUT' });
    expect(reader.signals[0].aborted).toBe(true);
    expect(resilience.bulkhead('recipeRead').active).toBe(1);
    reader.release?.();
    await expect.poll(() => resilience.bulkhead('recipeRead').active).toBe(0);
    expect(resilience.circuitBreaker('recipeDatabase').stats.failures).toBe(0);
  });

  it('counts nested transient causes, opens with Retry-After, and closes after a successful probe', async () => {
    const cause = Object.assign(new Error('Controlled connection loss'), { code: 'ECONNRESET' });
    reader.failure = new DatabaseError('Controlled database read failure', { cause });
    for (let call = 0; call < 5; call++) expect((await fetch(`${baseUrl}/recipes`)).status).toBe(500);
    expect(reader.signals).toHaveLength(5); // No automatic retries.
    expect(reader.failure.cause).toBe(cause);
    const unavailable = await fetch(`${baseUrl}/recipes`);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('retry-after')).toBe('1');
    expect(await unavailable.json()).toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(resilience.circuitBreaker('recipeDatabase').state).toBe('open');
    reader.failure = undefined;
    await expect.poll(() => resilience.circuitBreaker('recipeDatabase').state).toBe('half-open');
    expect((await fetch(`${baseUrl}/recipes`)).status).toBe(200);
    expect(resilience.circuitBreaker('recipeDatabase').state).toBe('closed');
  });

  it('keeps permanent database errors visible without opening the transient-outage breaker', async () => {
    const cause = Object.assign(new Error('Controlled missing relation'), { code: '42P01' });
    reader.failure = new DatabaseError('Controlled database schema failure', { cause });
    for (let call = 0; call < 6; call++) expect((await fetch(`${baseUrl}/recipes`)).status).toBe(500);
    expect(reader.signals).toHaveLength(6);
    expect(resilience.circuitBreaker('recipeDatabase').stats).toMatchObject({ total: 0, failures: 0 });
    expect(resilience.circuitBreaker('recipeDatabase').state).toBe('closed');
  });
});
