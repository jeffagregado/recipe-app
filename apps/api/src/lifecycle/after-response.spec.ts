import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAfterResponse } from './after-response.js';

/** Where the Vercel runtime publishes the current request's `waitUntil`; `@vercel/functions` reads it from here. */
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

/** Stands in for the Vercel runtime and returns the promises handed to its `waitUntil`. */
function onVercel(): Promise<unknown>[] {
  const registered: Promise<unknown>[] = [];
  Object.defineProperty(globalThis, REQUEST_CONTEXT, {
    configurable: true,
    value: { get: () => ({ waitUntil: (promise: Promise<unknown>) => { registered.push(promise); } }) },
  });
  return registered;
}

describe('runAfterResponse', () => {
  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT];
  });

  it('keeps the function alive until the work settles on Vercel', async () => {
    const registered = onVercel();
    let finish!: () => void;
    const work = new Promise<void>((resolve) => { finish = resolve; });
    const onFailure = vi.fn();

    runAfterResponse(work, onFailure);

    expect(registered).toHaveLength(1);
    let settled = false;
    void registered[0].then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await registered[0];
    expect(settled).toBe(true);
    expect(onFailure).not.toHaveBeenCalled();
  });

  it.each([
    ['on Vercel', true],
    ['outside Vercel', false],
  ])('reports a failure to its handler and never rejects %s', async (_where, vercel) => {
    const registered = vercel ? onVercel() : [];
    const failure = new Error('storage unavailable');
    const reported = new Promise<unknown>((resolve) => {
      runAfterResponse(Promise.reject(failure), resolve);
    });

    await expect(reported).resolves.toBe(failure);
    expect(registered).toHaveLength(vercel ? 1 : 0);
    if (vercel) await expect(registered[0]).resolves.toBeUndefined();
  });
});
