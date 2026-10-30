import { waitUntil } from '@vercel/functions';

/**
 * Keeps work that may outlive its response running. On Vercel a function can be paused once it has replied, so the work
 * is registered with `waitUntil` (ADR 0005). Elsewhere `waitUntil` does nothing and the work runs as it always has.
 * A failure goes to `onFailure` and is never raised.
 */
export function runAfterResponse(work: Promise<unknown>, onFailure: (cause: unknown) => void): void {
  waitUntil(work.then(() => undefined, onFailure));
}
